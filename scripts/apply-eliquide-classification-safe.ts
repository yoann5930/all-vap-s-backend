/**
 * Applique la classification e-liquides SANS toucher aux stocks.
 * Relie manufacturerId / rangeId / volumeMl / classificationStatus.
 *
 * Usage:
 *   npx tsx scripts/apply-eliquide-classification-safe.ts
 *   npx tsx scripts/apply-eliquide-classification-safe.ts --apply
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  classifyProductName,
  coverExists,
  titleFromRangeSlug,
} from "../lib/catalog/eliquide-classification";
import {
  A_CLASSER_NAME,
  A_CLASSER_SLUG,
} from "../lib/catalog/eliquide-range-tokens";
import { loadKnownManufacturers } from "../lib/catalog/sumup-eliquide-manufacturers";
import prisma from "../lib/prisma";

const APPLY = process.argv.includes("--apply");

function newId(): string {
  return `c${randomBytes(12).toString("hex")}`;
}

async function ensureClassificationColumns() {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "classificationStatus" TEXT NOT NULL DEFAULT 'UNCLASSIFIED'`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "classificationSources" TEXT`
  );
}

async function ensureBrandAndRange(params: {
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
  if (!range) {
    const isAClasser = params.rangeSlug === A_CLASSER_SLUG;
    range = await prisma.productRange.create({
      data: {
        brandId: brand.id,
        manufacturerId: params.mfrId,
        name: params.rangeName,
        slug: params.rangeSlug,
        status: params.confirm && !isAClasser ? "verifie" : "a_verifier",
        verificationStatus:
          params.confirm && !isAClasser
            ? "OFFICIAL_CONFIRMED"
            : "NEEDS_CONFIRMATION",
        catalogVisible: params.confirm && !isAClasser,
        isActive: true,
        verifiedAt: params.confirm && !isAClasser ? new Date() : null,
      },
      select: { id: true },
    });
  } else if (params.confirm && params.rangeSlug !== A_CLASSER_SLUG) {
    await prisma.productRange.update({
      where: { id: range.id },
      data: {
        manufacturerId: params.mfrId,
        verificationStatus: "OFFICIAL_CONFIRMED",
        catalogVisible: true,
        status: "verifie",
        isActive: true,
        verifiedAt: new Date(),
      },
    });
  }
  return range.id;
}

async function main() {
  await ensureClassificationColumns();
  const known = loadKnownManufacturers();

  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      sumupName: true,
      category: true,
      sku: true,
      barcode: true,
      manufacturerId: true,
      rangeId: true,
      volumeMl: true,
      stock: true,
    },
  });

  let updated = 0;
  let linkedMfr = 0;
  let linkedRange = 0;
  let skipped = 0;
  const byStatus: Record<string, number> = {};

  for (const p of products) {
    const raw = (p.sumupName || p.name || "").trim();
    if (!raw) {
      skipped += 1;
      continue;
    }
    const row = classifyProductName({
      rawName: raw,
      category: p.category,
      sku: p.sku,
      barcode: p.barcode,
      known,
    });
    byStatus[row.classificationStatus] =
      (byStatus[row.classificationStatus] || 0) + 1;

    if (!row.isEliquid) {
      if (APPLY) {
        await prisma.$executeRawUnsafe(
          `UPDATE "Product" SET "classificationStatus"=$1, "classificationSources"=$2, "updatedAt"=NOW() WHERE id=$3`,
          "UNCLASSIFIED",
          JSON.stringify(row.sources),
          p.id
        );
        updated += 1;
      }
      continue;
    }

    if (!APPLY) continue;

    let manufacturerId = p.manufacturerId;
    let rangeId = p.rangeId;

    if (row.manufacturerSlug) {
      let mfr = await prisma.manufacturer.findUnique({
        where: { slug: row.manufacturerSlug },
        select: { id: true, name: true, slug: true },
      });
      if (!mfr) {
        mfr = await prisma.manufacturer.create({
          data: {
            name: row.manufacturerName || row.manufacturerSlug,
            slug: row.manufacturerSlug,
            isActive: true,
            status: "partiel",
          },
          select: { id: true, name: true, slug: true },
        });
      }
      manufacturerId = mfr.id;

      if (row.rangeSlug) {
        const confirm =
          row.classificationStatus === "CONFIRMED" ||
          (row.rangeSlug !== A_CLASSER_SLUG &&
            coverExists(row.manufacturerSlug, row.rangeSlug));
        rangeId = await ensureBrandAndRange({
          mfrId: mfr.id,
          mfrSlug: mfr.slug,
          mfrName: mfr.name,
          rangeSlug: row.rangeSlug,
          rangeName: row.rangeName || titleFromRangeSlug(row.rangeSlug, mfr.slug),
          confirm,
        });
        if (row.rangeSlug === A_CLASSER_SLUG) {
          // force non-public
          await prisma.productRange.updateMany({
            where: { id: rangeId },
            data: {
              catalogVisible: false,
              verificationStatus: "NEEDS_CONFIRMATION",
              name: A_CLASSER_NAME,
            },
          });
        }
      }
    }

    const volumeMl =
      row.volumeMl && (!p.volumeMl || p.volumeMl <= 0) ? row.volumeMl : p.volumeMl;

    // NEVER touch stock column
    await prisma.$executeRawUnsafe(
      `UPDATE "Product"
       SET "manufacturerId" = COALESCE($1, "manufacturerId"),
           "rangeId" = COALESCE($2, "rangeId"),
           "volumeMl" = COALESCE($3, "volumeMl"),
           "classificationStatus" = $4,
           "classificationSources" = $5,
           "updatedAt" = NOW()
       WHERE id = $6`,
      manufacturerId,
      rangeId,
      volumeMl,
      row.classificationStatus,
      JSON.stringify({
        sources: row.sources,
        displayName: row.displayName,
        rangeSlug: row.rangeSlug,
        manufacturerSlug: row.manufacturerSlug,
      }),
      p.id
    );
    updated += 1;
    if (manufacturerId && manufacturerId !== p.manufacturerId) linkedMfr += 1;
    if (rangeId && rangeId !== p.rangeId) linkedRange += 1;
  }

  const summary = {
    dryRun: !APPLY,
    productsScanned: products.length,
    updated,
    linkedMfr,
    linkedRange,
    skipped,
    byStatus,
    stocksTouched: false,
  };
  const out = path.join(
    process.cwd(),
    "rapports",
    "apply-eliquide-classification-latest.json"
  );
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(summary, null, 2), "utf8");
  console.log(JSON.stringify(summary, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
