/**
 * Moteur unique de classification catalogue.
 * Appelé à l'inventaire, SumUp, ajout/modif produit — jamais sur les stocks.
 *
 * Confiance métier :
 * - CONFIRME  → peut écrire manufacturerId / rangeId / volumeMl
 * - PROBABLE  → met à jour le statut uniquement (pas de rattachement auto)
 * - A_VALIDER → file admin, aucune invention
 */
import prisma from "@/lib/prisma";
import {
  classifyProductName,
  coverExists,
  titleFromRangeSlug,
} from "@/lib/catalog/eliquide-classification";
import {
  A_CLASSER_NAME,
  A_CLASSER_SLUG,
  type ClassificationStatus,
} from "@/lib/catalog/eliquide-range-tokens";
import { loadKnownManufacturers } from "@/lib/catalog/sumup-eliquide-manufacturers";

export type EngineConfidence = "CONFIRME" | "PROBABLE" | "A_VALIDER";

export type ClassifySource =
  | "inventory_scan"
  | "sumup_import"
  | "product_upsert"
  | "barcode_link"
  | "catalog_resync"
  | "audit_safe"
  | "admin";

export type ClassifyResult = {
  productId: string;
  ean: string | null;
  confidence: EngineConfidence;
  applied: boolean;
  skipped: boolean;
  reason: string;
  oldManufacturerId: string | null;
  newManufacturerId: string | null;
  oldRangeId: string | null;
  newRangeId: string | null;
  manufacturerSlug: string | null;
  rangeSlug: string | null;
  classificationStatus: ClassificationStatus;
};

function toConfidence(status: ClassificationStatus): EngineConfidence {
  if (status === "CONFIRMED") return "CONFIRME";
  if (status === "AUTO_CLASSIFIED") return "PROBABLE";
  return "A_VALIDER";
}

function isResistanceLike(p: {
  category?: string | null;
  productType?: string | null;
  name?: string | null;
}): boolean {
  const blob = `${p.category || ""} ${p.productType || ""} ${p.name || ""}`.toLowerCase();
  return /\br[ée]sistance|ohm|coil\b/.test(blob);
}

async function ensureTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CatalogEanMap" (
      "id" TEXT PRIMARY KEY,
      "ean" TEXT NOT NULL UNIQUE,
      "productId" TEXT NOT NULL,
      "manufacturerId" TEXT,
      "rangeId" TEXT,
      "category" TEXT,
      "confidence" TEXT NOT NULL DEFAULT 'A_VALIDER',
      "source" TEXT NOT NULL DEFAULT 'inventory_scan',
      "validatedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "CatalogEanMap_productId_idx" ON "CatalogEanMap"("productId")`
  );
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ClassificationChangeLog" (
      "id" TEXT PRIMARY KEY,
      "productId" TEXT NOT NULL,
      "ean" TEXT,
      "oldManufacturerId" TEXT,
      "newManufacturerId" TEXT,
      "oldRangeId" TEXT,
      "newRangeId" TEXT,
      "reason" TEXT NOT NULL,
      "confidence" TEXT NOT NULL,
      "source" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "ClassificationChangeLog_productId_idx" ON "ClassificationChangeLog"("productId")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "ClassificationChangeLog_createdAt_idx" ON "ClassificationChangeLog"("createdAt")`
  );
}

async function ensureRange(params: {
  mfrId: string;
  mfrSlug: string;
  mfrName: string;
  rangeSlug: string;
  rangeName: string;
  confirm: boolean;
}): Promise<string> {
  let brand = await prisma.brand.findUnique({
    where: { slug: params.mfrSlug },
    select: { id: true },
  });
  if (!brand) {
    brand = await prisma.brand.create({
      data: {
        name: params.mfrName,
        slug: params.mfrSlug,
        manufacturerId: params.mfrId,
        isActive: true,
        status: "partiel",
      },
      select: { id: true },
    });
  }

  let range =
    (await prisma.productRange.findFirst({
      where: { manufacturerId: params.mfrId, slug: params.rangeSlug },
      select: { id: true },
    })) ||
    (await prisma.productRange.findFirst({
      where: { brandId: brand.id, slug: params.rangeSlug },
      select: { id: true },
    }));

  const isAClasser = params.rangeSlug === A_CLASSER_SLUG;
  if (!range) {
    range = await prisma.productRange.create({
      data: {
        brandId: brand.id,
        manufacturerId: params.mfrId,
        name: params.rangeName || titleFromRangeSlug(params.rangeSlug, params.mfrSlug),
        slug: params.rangeSlug,
        status: params.confirm && !isAClasser ? "verifie" : "a_verifier",
        verificationStatus:
          params.confirm && !isAClasser
            ? "OFFICIAL_CONFIRMED"
            : "NEEDS_CONFIRMATION",
        catalogVisible: params.confirm && !isAClasser,
        isActive: true,
      },
      select: { id: true },
    });
  } else if (params.confirm && !isAClasser) {
    await prisma.productRange.update({
      where: { id: range.id },
      data: {
        manufacturerId: params.mfrId,
        verificationStatus: "OFFICIAL_CONFIRMED",
        catalogVisible: true,
        status: "verifie",
        isActive: true,
      },
    });
  } else if (isAClasser) {
    await prisma.productRange.update({
      where: { id: range.id },
      data: {
        name: A_CLASSER_NAME,
        catalogVisible: false,
        verificationStatus: "NEEDS_CONFIRMATION",
      },
    });
  }
  return range.id;
}

async function upsertEanMap(params: {
  ean: string;
  productId: string;
  manufacturerId: string | null;
  rangeId: string | null;
  category: string | null;
  confidence: EngineConfidence;
  source: ClassifySource;
}) {
  const ean = params.ean.trim();
  if (ean.length < 6 || ean.startsWith("MEM-")) return;
  const id = `ean_${ean}`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "CatalogEanMap"
      ("id","ean","productId","manufacturerId","rangeId","category","confidence","source","validatedAt","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
     ON CONFLICT ("ean") DO UPDATE SET
       "productId" = EXCLUDED."productId",
       "manufacturerId" = COALESCE(EXCLUDED."manufacturerId", "CatalogEanMap"."manufacturerId"),
       "rangeId" = COALESCE(EXCLUDED."rangeId", "CatalogEanMap"."rangeId"),
       "category" = COALESCE(EXCLUDED."category", "CatalogEanMap"."category"),
       "confidence" = CASE
         WHEN EXCLUDED."confidence" = 'CONFIRME' THEN 'CONFIRME'
         WHEN "CatalogEanMap"."confidence" = 'CONFIRME' THEN 'CONFIRME'
         ELSE EXCLUDED."confidence"
       END,
       "source" = EXCLUDED."source",
       "validatedAt" = CASE WHEN EXCLUDED."confidence" = 'CONFIRME' THEN NOW() ELSE "CatalogEanMap"."validatedAt" END,
       "updatedAt" = NOW()`,
    id,
    ean,
    params.productId,
    params.manufacturerId,
    params.rangeId,
    params.category,
    params.confidence,
    params.source,
    params.confidence === "CONFIRME" ? new Date() : null
  );
}

async function writeLog(params: {
  productId: string;
  ean: string | null;
  oldManufacturerId: string | null;
  newManufacturerId: string | null;
  oldRangeId: string | null;
  newRangeId: string | null;
  reason: string;
  confidence: EngineConfidence;
  source: ClassifySource;
}) {
  const id = `clog_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "ClassificationChangeLog"
      ("id","productId","ean","oldManufacturerId","newManufacturerId","oldRangeId","newRangeId","reason","confidence","source","createdAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())`,
    id,
    params.productId,
    params.ean,
    params.oldManufacturerId,
    params.newManufacturerId,
    params.oldRangeId,
    params.newRangeId,
    params.reason,
    params.confidence,
    params.source
  );
}

/**
 * Classifie un produit et applique uniquement les rattachements CONFIRME.
 * Ne touche jamais stock / stockQuantity / mouvements.
 */
export async function classifyProductById(params: {
  productId: string;
  source: ClassifySource;
  barcodeHint?: string | null;
  apply?: boolean;
}): Promise<ClassifyResult> {
  await ensureTables();
  const apply = params.apply !== false;

  const product = await prisma.product.findUnique({
    where: { id: params.productId },
    select: {
      id: true,
      name: true,
      sumupName: true,
      category: true,
      productType: true,
      sku: true,
      barcode: true,
      manufacturerId: true,
      rangeId: true,
      volumeMl: true,
      classificationStatus: true,
    },
  });

  if (!product) {
    return {
      productId: params.productId,
      ean: null,
      confidence: "A_VALIDER",
      applied: false,
      skipped: true,
      reason: "product_not_found",
      oldManufacturerId: null,
      newManufacturerId: null,
      oldRangeId: null,
      newRangeId: null,
      manufacturerSlug: null,
      rangeSlug: null,
      classificationStatus: "UNCLASSIFIED",
    };
  }

  const ean = (params.barcodeHint || product.barcode || "").trim() || null;

  // Mémoire EAN validée en premier
  if (ean && ean.length >= 6 && !ean.startsWith("MEM-")) {
    const mapped = await prisma.$queryRawUnsafe<
      Array<{
        productId: string;
        manufacturerId: string | null;
        rangeId: string | null;
        confidence: string;
      }>
    >(
      `SELECT "productId","manufacturerId","rangeId","confidence" FROM "CatalogEanMap" WHERE "ean" = $1 LIMIT 1`,
      ean
    );
    const hit = mapped[0];
    if (
      hit &&
      hit.confidence === "CONFIRME" &&
      hit.manufacturerId &&
      hit.rangeId &&
      apply
    ) {
      const same =
        product.manufacturerId === hit.manufacturerId &&
        product.rangeId === hit.rangeId;
      if (same) {
        return {
          productId: product.id,
          ean,
          confidence: "CONFIRME",
          applied: false,
          skipped: true,
          reason: "ean_map_already_correct",
          oldManufacturerId: product.manufacturerId,
          newManufacturerId: product.manufacturerId,
          oldRangeId: product.rangeId,
          newRangeId: product.rangeId,
          manufacturerSlug: null,
          rangeSlug: null,
          classificationStatus: "CONFIRMED",
        };
      }
      await prisma.$executeRawUnsafe(
        `UPDATE "Product"
         SET "manufacturerId" = $1,
             "rangeId" = $2,
             "classificationStatus" = 'CONFIRMED',
             "classificationSources" = $3,
             "updatedAt" = NOW()
         WHERE id = $4`,
        hit.manufacturerId,
        hit.rangeId,
        JSON.stringify({ sources: ["ean_map"], ean }),
        product.id
      );
      await writeLog({
        productId: product.id,
        ean,
        oldManufacturerId: product.manufacturerId,
        newManufacturerId: hit.manufacturerId,
        oldRangeId: product.rangeId,
        newRangeId: hit.rangeId,
        reason: "ean_map_confirmed",
        confidence: "CONFIRME",
        source: params.source,
      });
      return {
        productId: product.id,
        ean,
        confidence: "CONFIRME",
        applied: true,
        skipped: false,
        reason: "ean_map_confirmed",
        oldManufacturerId: product.manufacturerId,
        newManufacturerId: hit.manufacturerId,
        oldRangeId: product.rangeId,
        newRangeId: hit.rangeId,
        manufacturerSlug: null,
        rangeSlug: null,
        classificationStatus: "CONFIRMED",
      };
    }
  }

  if (isResistanceLike(product)) {
    return {
      productId: product.id,
      ean,
      confidence: "A_VALIDER",
      applied: false,
      skipped: true,
      reason: "resistance_no_auto_merge",
      oldManufacturerId: product.manufacturerId,
      newManufacturerId: product.manufacturerId,
      oldRangeId: product.rangeId,
      newRangeId: product.rangeId,
      manufacturerSlug: null,
      rangeSlug: null,
      classificationStatus:
        (product.classificationStatus as ClassificationStatus) || "UNCLASSIFIED",
    };
  }

  const known = loadKnownManufacturers();
  const row = classifyProductName({
    rawName: (product.sumupName || product.name || "").trim(),
    category: product.category,
    sku: product.sku,
    barcode: ean,
    known,
  });
  const confidence = toConfidence(row.classificationStatus);

  // Toujours synchroniser le statut / sources (pas les stocks)
  if (apply) {
    await prisma.$executeRawUnsafe(
      `UPDATE "Product"
       SET "classificationStatus" = $1,
           "classificationSources" = $2,
           "updatedAt" = NOW()
       WHERE id = $3`,
      row.classificationStatus,
      JSON.stringify({
        sources: row.sources,
        displayName: row.displayName,
        confidence,
        engine: true,
      }),
      product.id
    );
  }

  if (confidence !== "CONFIRME" || !row.manufacturerSlug || !row.rangeSlug) {
    if (ean) {
      await upsertEanMap({
        ean,
        productId: product.id,
        manufacturerId: product.manufacturerId,
        rangeId: product.rangeId,
        category: product.category,
        confidence,
        source: params.source,
      });
    }
    return {
      productId: product.id,
      ean,
      confidence,
      applied: false,
      skipped: confidence !== "CONFIRME",
      reason: row.reason || row.classificationStatus.toLowerCase(),
      oldManufacturerId: product.manufacturerId,
      newManufacturerId: product.manufacturerId,
      oldRangeId: product.rangeId,
      newRangeId: product.rangeId,
      manufacturerSlug: row.manufacturerSlug,
      rangeSlug: row.rangeSlug,
      classificationStatus: row.classificationStatus,
    };
  }

  if (!apply) {
    return {
      productId: product.id,
      ean,
      confidence,
      applied: false,
      skipped: true,
      reason: "dry_run",
      oldManufacturerId: product.manufacturerId,
      newManufacturerId: product.manufacturerId,
      oldRangeId: product.rangeId,
      newRangeId: product.rangeId,
      manufacturerSlug: row.manufacturerSlug,
      rangeSlug: row.rangeSlug,
      classificationStatus: row.classificationStatus,
    };
  }

  const mfr = await prisma.manufacturer.upsert({
    where: { slug: row.manufacturerSlug },
    create: {
      name: row.manufacturerName || row.manufacturerSlug,
      slug: row.manufacturerSlug,
      isActive: true,
      status: "partiel",
    },
    update: { isActive: true },
    select: { id: true, slug: true, name: true },
  });

  const confirm =
    row.classificationStatus === "CONFIRMED" ||
    (row.rangeSlug !== A_CLASSER_SLUG &&
      coverExists(mfr.slug, row.rangeSlug));

  // CONFIRME uniquement si cover / token certain confirmé
  if (!confirm) {
    return {
      productId: product.id,
      ean,
      confidence: "PROBABLE",
      applied: false,
      skipped: true,
      reason: "confirmed_status_without_cover_proof",
      oldManufacturerId: product.manufacturerId,
      newManufacturerId: product.manufacturerId,
      oldRangeId: product.rangeId,
      newRangeId: product.rangeId,
      manufacturerSlug: row.manufacturerSlug,
      rangeSlug: row.rangeSlug,
      classificationStatus: "AUTO_CLASSIFIED",
    };
  }

  const rangeId = await ensureRange({
    mfrId: mfr.id,
    mfrSlug: mfr.slug,
    mfrName: mfr.name,
    rangeSlug: row.rangeSlug,
    rangeName: row.rangeName || titleFromRangeSlug(row.rangeSlug, mfr.slug),
    confirm: true,
  });

  const same =
    product.manufacturerId === mfr.id && product.rangeId === rangeId;
  const volumeMl =
    row.volumeMl && (!product.volumeMl || product.volumeMl <= 0)
      ? row.volumeMl
      : product.volumeMl;

  if (!same || (volumeMl && volumeMl !== product.volumeMl)) {
    await prisma.$executeRawUnsafe(
      `UPDATE "Product"
       SET "manufacturerId" = $1,
           "rangeId" = $2,
           "volumeMl" = COALESCE($3, "volumeMl"),
           "classificationStatus" = 'CONFIRMED',
           "classificationSources" = $4,
           "updatedAt" = NOW()
       WHERE id = $5`,
      mfr.id,
      rangeId,
      volumeMl,
      JSON.stringify({
        sources: row.sources,
        displayName: row.displayName,
        confidence: "CONFIRME",
        engine: true,
      }),
      product.id
    );
  }

  if (!same) {
    await writeLog({
      productId: product.id,
      ean,
      oldManufacturerId: product.manufacturerId,
      newManufacturerId: mfr.id,
      oldRangeId: product.rangeId,
      newRangeId: rangeId,
      reason: `auto:${row.sources.join("+")}`,
      confidence: "CONFIRME",
      source: params.source,
    });
  }

  if (ean) {
    await upsertEanMap({
      ean,
      productId: product.id,
      manufacturerId: mfr.id,
      rangeId,
      category: product.category,
      confidence: "CONFIRME",
      source: params.source,
    });
  }

  return {
    productId: product.id,
    ean,
    confidence: "CONFIRME",
    applied: !same,
    skipped: same,
    reason: same ? "already_correct" : "auto_confirmed",
    oldManufacturerId: product.manufacturerId,
    newManufacturerId: mfr.id,
    oldRangeId: product.rangeId,
    newRangeId: rangeId,
    manufacturerSlug: mfr.slug,
    rangeSlug: row.rangeSlug,
    classificationStatus: "CONFIRMED",
  };
}

/** Fire-and-forget safe wrapper for inventory (never throws to caller). */
export async function classifyOnInventoryScan(params: {
  productId: string;
  barcode?: string | null;
}): Promise<ClassifyResult | null> {
  try {
    return await classifyProductById({
      productId: params.productId,
      barcodeHint: params.barcode,
      source: "inventory_scan",
      apply: true,
    });
  } catch (e) {
    console.error("[classification-engine] inventory scan failed", e);
    return null;
  }
}
