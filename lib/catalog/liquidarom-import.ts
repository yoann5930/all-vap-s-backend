/**
 * Import Liquidarom — logique partagée (script CLI + API admin prod).
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "@/lib/prisma";
import { normalizeProductName, extractExplicitSpecs } from "@/lib/catalog/normalize";
import { slugify } from "@/lib/utils";
import { isGroupPhotoUrl } from "@/lib/catalog/images";
import { ensureLiquidaromRanges, matchRangeSlugFromText } from "@/lib/catalog/ranges";
import { ensureProductImageEtastyStyle } from "@/lib/catalog/normalize-product-image";
import {
  productPublicImagePath,
  productFlavorSlug,
  resolveOfficialName,
} from "@/lib/catalog/liquidarom-meta";

export type LiquidaromImportStats = {
  read: number;
  created: number;
  updated: number;
  skipped: number;
  unchanged: number;
  flavorsUpserted: number;
  avaMetaUpserted: number;
  imagesLinked: number;
  imagesMissing: number;
  duplicatesAvoided: number;
  withoutPrice: number;
  withoutStock: number;
  errors: string[];
  toReview: string[];
};

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, "");
}

export function parseSemicolonCsv(content: string): Record<string, string>[] {
  const text = stripBom(content).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ";") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .filter((r) => r.some((c) => c.trim()))
    .map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        obj[h] = (r[idx] ?? "").trim();
      });
      return obj;
    });
}

function yes(value: string | undefined): boolean {
  const v = (value || "").trim().toLowerCase();
  return v === "oui" || v === "yes" || v === "true" || v === "1";
}

function parsePriceEuros(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d,.-]/g, "").replace(",", ".");
  if (!cleaned || cleaned.startsWith("=")) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

function parseStock(raw: string | undefined): number | null {
  if (!raw) return null;
  if (raw.startsWith("=")) return null;
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function parseNicotine(raw: string | undefined): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(String(raw).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function mapCategory(csvCategory: string): string {
  const c = csvCategory.toLowerCase();
  if (c.includes("e-liquide") || c.includes("eliquide")) return "e-liquides";
  if (c.includes("pod")) return "pods";
  if (c.includes("diy")) return "diy";
  if (c.includes("résistance") || c.includes("resistance")) return "resistances";
  if (c.includes("cigarette") || c.includes("mod")) return "cigarettes-electroniques";
  return "accessoires";
}

function freshnessLevel(raw: string | undefined): boolean | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (["oui", "yes", "true", "1"].includes(v)) return true;
  if (["non", "no", "false", "0"].includes(v)) return false;
  return null;
}

function parsePgVg(raw: string | undefined): { pg?: number; vg?: number; label?: string } {
  if (!raw) return {};
  const label = raw.trim();
  const m = label.match(/(\d+)\s*\/\s*(\d+)/);
  if (m) return { pg: parseInt(m[1], 10), vg: parseInt(m[2], 10), label };
  return { label: label || undefined };
}

function resolveLocalImageUrl(row: Record<string, string>, range: string | null, name: string): string | null {
  const explicit = row.imageUrl || row["imageUrl"] || "";
  if (explicit && !isGroupPhotoUrl(explicit) && !/^image-\d+\.jpg$/i.test(explicit)) {
    return explicit.startsWith("/") ? explicit : `/${explicit.replace(/^\/+/, "")}`;
  }
  const rel = productPublicImagePath({ range: range || "", commercialName: name });
  const abs = path.join(process.cwd(), "public", rel.replace(/^\//, "").replace(/\//g, path.sep));
  if (fs.existsSync(abs)) return rel;
  return null;
}

function pick<T>(incoming: T | null | undefined, existing: T | null | undefined): T | null | undefined {
  if (incoming === null || incoming === undefined || incoming === "") return existing;
  return incoming;
}

async function ensureBrand(name: string) {
  const slug = slugify(name);
  return prisma.brand.upsert({
    where: { slug },
    create: { name, slug, isActive: true },
    update: { name, isActive: true },
  });
}

async function ensureCategory(slug: string, name: string) {
  return prisma.category.upsert({
    where: { slug },
    create: { name, slug, isActive: true, sortOrder: 10 },
    update: { name, isActive: true },
  });
}

export function resolveBundledLiquidaromPaths() {
  const base = path.join(process.cwd(), "data", "liquidarom");
  return {
    productsPath: path.join(base, "All_Vaps_Produits_Magasin_MAJ_Liquidarom.csv"),
    flavorsPath: path.join(base, "All_Vaps_Profils_Saveurs_AVA_MAJ_Liquidarom.csv"),
  };
}

export async function importLiquidaromFromCsv(params: {
  productsCsv: string;
  flavorsCsv: string;
  dryRun?: boolean;
}): Promise<LiquidaromImportStats> {
  const dryRun = Boolean(params.dryRun);
  const productRows = parseSemicolonCsv(params.productsCsv);
  const flavorRows = parseSemicolonCsv(params.flavorsCsv);
  const flavorsByProductId = new Map<string, Record<string, string>>();
  for (const f of flavorRows) {
    const id = f["ID produit"];
    if (id) flavorsByProductId.set(id, f);
  }

  const stats: LiquidaromImportStats = {
    read: productRows.length,
    created: 0,
    updated: 0,
    skipped: 0,
    unchanged: 0,
    flavorsUpserted: 0,
    avaMetaUpserted: 0,
    imagesLinked: 0,
    imagesMissing: 0,
    duplicatesAvoided: 0,
    withoutPrice: 0,
    withoutStock: 0,
    errors: [],
    toReview: [],
  };

  await ensureLiquidaromRanges();
  const liquidaromBrand = await prisma.brand.findFirst({ where: { slug: "liquidarom" } });
  const rangeBySlug = new Map(
    liquidaromBrand
      ? (
          await prisma.productRange.findMany({ where: { brandId: liquidaromBrand.id } })
        ).map((r) => [r.slug, r.id])
      : []
  );

  for (const row of productRows) {
    const externalId = row["ID produit"] || row.reference;
    const rawName = row["Nom commercial"] || row.name;
    const name = resolveOfficialName(externalId, rawName);
    if (!externalId || !name) {
      stats.skipped++;
      stats.errors.push(`Ligne sans ID/nom`);
      continue;
    }

    try {
      const brandName = row["Marque"] || row.fabricant || "Liquidarom";
      const range = row["Sous-catégorie"] || row.gamme || null;
      const rangeSlug = range ? matchRangeSlugFromText(`${range} ${name}`) : null;
      const rangeId = rangeSlug ? rangeBySlug.get(rangeSlug) ?? null : null;
      const categorySlug = mapCategory(row["Catégorie"] || row.categorie || "E-liquide");
      const categoryName = row["Catégorie"] || row.categorie || "E-liquides";
      const barcode = row["Code-barres / SKU"] || row.ean || null;
      const priceCents = parsePriceEuros(row["Prix vente TTC (€)"]);
      const stockTotal = parseStock(row["Stock total"]);
      const nicotineMg = parseNicotine(row["Taux nicotine (mg/ml)"] || row.nicotine);
      const capacityRaw = row["Format / Contenance"] || row.format || "";
      const capacityMatch = capacityRaw.match(/(\d+(?:[.,]\d+)?)\s*ml/i);
      const capacityMl = capacityMatch ? parseFloat(capacityMatch[1].replace(",", ".")) : null;
      const shortDescription = row["Description courte"] || row.shortDescription || null;
      const longDescription = row["Description complète"] || row.longDescription || null;
      const description = longDescription || shortDescription || null;
      const pgvg = parsePgVg(row["Ratio PG/VG"] || row.pgvg);
      const flavorSlug = row.slug || productFlavorSlug(name);
      const slugBase = slugify(`liquidarom-${range || "eliquide"}-${flavorSlug}-50ml`);
      const sku = externalId;
      const imageUrlCandidateRaw = resolveLocalImageUrl(row, range, name);
      let imageUrlCandidate = imageUrlCandidateRaw;
      if (imageUrlCandidateRaw && !isGroupPhotoUrl(imageUrlCandidateRaw) && !dryRun) {
        try {
          imageUrlCandidate = await ensureProductImageEtastyStyle({
            sourceUrl: imageUrlCandidateRaw,
            productName: name,
            brand: "Liquidarom",
            manufacturerSlug: "liquidarom",
            rangeSlug: range || undefined,
            format: capacityMl ? `${capacityMl}ml` : "50ml",
            productSlug: flavorSlug,
          });
        } catch (e) {
          stats.errors.push(
            `image-style ${externalId}: ${e instanceof Error ? e.message : String(e)}`
          );
          imageUrlCandidate = null;
        }
      }
      const imageStatusRaw = (row.imageStatus || "").toLowerCase();
      const imageDbStatus =
        imageStatusRaw === "validated"
          ? "validated"
          : imageStatusRaw === "official" && imageUrlCandidate
            ? "official"
            : "pending";

      if (/vérifier|confirmer|to_review/i.test(row.productStatus || row.imageStatus || row["Notes internes"] || "")) {
        stats.toReview.push(`${externalId}: ${name}`);
      }

      if (priceCents == null) stats.withoutPrice++;
      if (stockTotal == null) stats.withoutStock++;

      if (dryRun) {
        const existing = await prisma.product.findFirst({
          where: {
            OR: [{ sku }, { reference: externalId }, ...(barcode ? [{ barcode }] : []), { normalizedName: normalizeProductName(name) }],
          },
        });
        if (existing) {
          stats.updated++;
          stats.duplicatesAvoided++;
        } else stats.created++;
        if (imageUrlCandidate) stats.imagesLinked++;
        else stats.imagesMissing++;
        continue;
      }

      const normalizedName = normalizeProductName(name);
      const specs = extractExplicitSpecs(`${name} ${capacityRaw} ${description || ""}`);
      const isActive = true;
      const visibleOnline = yes(row["Actif en ligne"]) || yes(row.visibility) || true;

      const brand = await ensureBrand(brandName);
      const category = await ensureCategory(
        categorySlug,
        categoryName === "E-liquide" ? "E-liquides" : categoryName
      );

      const existing = await prisma.product.findFirst({
        where: {
          OR: [
            { sku },
            { reference: externalId },
            ...(barcode ? [{ barcode }] : []),
            { AND: [{ brand: brandName }, { normalizedName }] },
          ],
        },
        include: { stockLevels: true, catalogImages: true },
      });

      if (existing && (existing.sku === sku || existing.reference === externalId)) {
        stats.duplicatesAvoided++;
      }

      const hasSumUpStock =
        Boolean(existing?.sumupProductId) || (existing?.stockLevels?.length || 0) > 0;

      const nextPrice =
        priceCents != null
          ? priceCents
          : existing?.priceCents && existing.priceCents > 0
            ? existing.priceCents
            : 0;

      const nextStock = hasSumUpStock
        ? existing!.stock
        : stockTotal != null
          ? stockTotal
          : (existing?.stock ?? 0);

      const data = {
        sku,
        reference: externalId,
        name,
        normalizedName,
        description: ((pick(description, existing?.description) as string | null) ?? null),
        shortDescription: ((pick(shortDescription, existing?.shortDescription) as string | null) ?? null),
        longDescription: ((pick(longDescription, existing?.longDescription) as string | null) ?? null),
        category: categorySlug,
        subcategory: range,
        brand: brandName,
        range,
        rangeId,
        productType: row["Type de produit"] || null,
        categoryId: category.id,
        brandId: brand.id,
        barcode: ((pick(barcode, existing?.barcode) as string | null) ?? null),
        priceCents: nextPrice,
        stock: nextStock,
        source: existing?.source === "sumup" ? "sumup" : "liquidarom",
        isActive,
        visibleOnline,
        slug: existing?.slug || slugBase,
        sumupName: existing?.sumupName ?? null,
        sumupReference: existing?.sumupReference ?? null,
        sumupSku: existing?.sumupSku ?? null,
        sumupProductId: existing?.sumupProductId ?? null,
        sumupVariantId: existing?.sumupVariantId ?? null,
      };

      let productId: string;
      if (existing) {
        const changed =
          existing.name !== data.name ||
          existing.priceCents !== data.priceCents ||
          existing.description !== data.description ||
          existing.isActive !== data.isActive ||
          existing.brand !== data.brand ||
          existing.range !== data.range;

        await prisma.product.update({
          where: { id: existing.id },
          data: {
            ...data,
            description: data.description || existing.description,
            barcode: data.barcode || existing.barcode,
            imageUrl: imageUrlCandidate || existing.imageUrl,
            imageStatus: imageUrlCandidate ? imageDbStatus : existing.imageStatus || "pending",
          },
        });
        productId = existing.id;
        if (changed) stats.updated++;
        else stats.unchanged++;
      } else {
        let slug = slugBase;
        let n = 1;
        while (await prisma.product.findUnique({ where: { slug } })) {
          slug = `${slugBase}-${n++}`;
        }
        const created = await prisma.product.create({
          data: {
            ...data,
            slug,
            images: [],
            imageUrl: imageUrlCandidate,
            imageStatus: imageUrlCandidate ? imageDbStatus : "pending",
          },
        });
        productId = created.id;
        stats.created++;
      }

      if (imageUrlCandidate && !isGroupPhotoUrl(imageUrlCandidate)) {
        const existingImg = await prisma.productImage.findFirst({
          where: { productId, sortOrder: 0 },
        });
        if (existingImg) {
          await prisma.productImage.update({
            where: { id: existingImg.id },
            data: { url: imageUrlCandidate, status: imageDbStatus },
          });
        } else {
          await prisma.productImage.create({
            data: {
              productId,
              url: imageUrlCandidate,
              status: imageDbStatus,
              sortOrder: 0,
            },
          });
        }
        await prisma.product.update({
          where: { id: productId },
          data: { imageUrl: imageUrlCandidate, imageStatus: imageDbStatus },
        });
        stats.imagesLinked++;
      } else {
        stats.imagesMissing++;
      }

      const variantName =
        [
          capacityMl != null ? `${capacityMl} ml` : null,
          nicotineMg != null ? `${nicotineMg} mg` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "Standard";

      const existingVariant = await prisma.productVariant.findFirst({
        where: { productId, name: variantName },
      });

      if (existingVariant) {
        await prisma.productVariant.update({
          where: { id: existingVariant.id },
          data: {
            nicotineMg: nicotineMg ?? existingVariant.nicotineMg,
            capacityMl: capacityMl ?? specs.capacityMl ?? existingVariant.capacityMl,
            pgRatio: pgvg.pg ?? existingVariant.pgRatio,
            vgRatio: pgvg.vg ?? existingVariant.vgRatio,
            pgVgLabel: pgvg.label ?? existingVariant.pgVgLabel,
            sku,
            barcode: barcode || existingVariant.barcode,
            active: true,
          },
        });
      } else {
        await prisma.productVariant.create({
          data: {
            productId,
            name: variantName,
            sku,
            barcode,
            nicotineMg,
            capacityMl: capacityMl ?? specs.capacityMl,
            pgRatio: pgvg.pg,
            vgRatio: pgvg.vg,
            pgVgLabel: pgvg.label,
            active: true,
          },
        });
      }

      const flavorRow = flavorsByProductId.get(externalId);
      if (flavorRow) {
        const existingFlavor = await prisma.productFlavor.findFirst({
          where: { productId },
        });
        const flavorData = {
          primaryFlavor: flavorRow["Saveur principale"] || null,
          secondaryFlavor: flavorRow["Saveur secondaire 1"] || null,
          secondaryFlavor2: flavorRow["Saveur secondaire 2"] || null,
          flavorFamily: flavorRow["Famille de goût"] || null,
          isFresh: freshnessLevel(flavorRow["Frais / glacé"]),
          isFruity: (flavorRow["Famille de goût"] || "").toLowerCase().includes("fruit"),
          isGourmet: (flavorRow["Famille de goût"] || "").toLowerCase().includes("gourmand"),
          isMint: (flavorRow["Famille de goût"] || "").toLowerCase().includes("menthe"),
          isTobacco: (flavorRow["Famille de goût"] || "").toLowerCase().includes("tabac"),
          freshnessLevel: flavorRow["Niveau de fraîcheur"] || null,
          intensity: flavorRow["Intensité aromatique"] || null,
          searchKeywords: flavorRow["Mots-clés recherchables"] || null,
          validatedManually: /valid/i.test(flavorRow["Statut validation"] || ""),
          confidenceScore: /vérifier|confirmer/i.test(flavorRow["Statut validation"] || "") ? 0.5 : 0.9,
        };

        if (existingFlavor) {
          await prisma.productFlavor.update({
            where: { id: existingFlavor.id },
            data: {
              primaryFlavor: flavorData.primaryFlavor || existingFlavor.primaryFlavor,
              secondaryFlavor: flavorData.secondaryFlavor || existingFlavor.secondaryFlavor,
              secondaryFlavor2: flavorData.secondaryFlavor2 || existingFlavor.secondaryFlavor2,
              flavorFamily: flavorData.flavorFamily || existingFlavor.flavorFamily,
              isFresh: flavorData.isFresh ?? existingFlavor.isFresh,
              isFruity: flavorData.isFruity ?? existingFlavor.isFruity,
              isGourmet: flavorData.isGourmet ?? existingFlavor.isGourmet,
              isMint: flavorData.isMint ?? existingFlavor.isMint,
              isTobacco: flavorData.isTobacco ?? existingFlavor.isTobacco,
              freshnessLevel: flavorData.freshnessLevel || existingFlavor.freshnessLevel,
              intensity: flavorData.intensity || existingFlavor.intensity,
              searchKeywords: flavorData.searchKeywords || existingFlavor.searchKeywords,
            },
          });
        } else {
          await prisma.productFlavor.create({
            data: { productId, ...flavorData },
          });
        }
        stats.flavorsUpserted++;

        const avaData = {
          avaKeywords: flavorRow["Mots-clés recherchables"] || null,
          avaDescription: flavorRow["Description simple pour le client"] || null,
          avaRecommendations: flavorRow["Produits similaires"] || null,
          avaSaveurs: [
            flavorRow["Saveur principale"],
            flavorRow["Saveur secondaire 1"],
            flavorRow["Saveur secondaire 2"],
          ]
            .filter(Boolean)
            .join(", "),
          avaSimilaires: flavorRow["Produits similaires"] || null,
          avaQuestions: flavorRow["Questions qu'A.V.A. doit poser"] || null,
        };
        await prisma.productAvaMeta.upsert({
          where: { productId },
          create: { productId, ...avaData },
          update: avaData,
        });
        stats.avaMetaUpserted++;
      }
    } catch (err) {
      stats.skipped++;
      stats.errors.push(`${externalId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return stats;
}

export async function importBundledLiquidarom(dryRun = false) {
  const bundled = resolveBundledLiquidaromPaths();
  const productsPath =
    process.env.LIQUIDAROM_PRODUCTS_CSV ||
    (fs.existsSync(bundled.productsPath) ? bundled.productsPath : "");
  const flavorsPath =
    process.env.LIQUIDAROM_FLAVORS_CSV ||
    (fs.existsSync(bundled.flavorsPath) ? bundled.flavorsPath : "");

  if (!productsPath || !flavorsPath) {
    throw new Error("CSV Liquidarom introuvables (data/liquidarom ou env LIQUIDAROM_*_CSV)");
  }

  return importLiquidaromFromCsv({
    productsCsv: fs.readFileSync(productsPath, "utf8"),
    flavorsCsv: fs.readFileSync(flavorsPath, "utf8"),
    dryRun,
  });
}
