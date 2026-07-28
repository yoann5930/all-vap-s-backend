/**
 * Import idempotent Liquidarom (CSV magasin + profils saveurs AVA).
 *
 * Usage :
 *   npx tsx scripts/import-liquidarom-products.ts --dry-run
 *   npx tsx scripts/import-liquidarom-products.ts
 *
 * Chemins CSV (override via env) :
 *   LIQUIDAROM_PRODUCTS_CSV
 *   LIQUIDAROM_FLAVORS_CSV
 */

import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma";
import { normalizeProductName, extractExplicitSpecs } from "../lib/catalog/normalize";
import { slugify } from "../lib/utils";

const DEFAULT_PRODUCTS = path.join(
  "c:/Users/ASUS/Downloads/ALLVAPS_CURSOR_CORRECTION_COMPLETE_V2/ALLVAPS_CURSOR_CORRECTION_COMPLETE_V2/data/All_Vaps_Produits_Magasin_MAJ_Liquidarom.csv"
);
const DEFAULT_FLAVORS = path.join(
  "c:/Users/ASUS/Downloads/ALLVAPS_CURSOR_CORRECTION_COMPLETE_V2/ALLVAPS_CURSOR_CORRECTION_COMPLETE_V2/data/All_Vaps_Profils_Saveurs_AVA_MAJ_Liquidarom.csv"
);

type Stats = {
  read: number;
  created: number;
  updated: number;
  skipped: number;
  unchanged: number;
  flavorsUpserted: number;
  withoutPrice: number;
  withoutStock: number;
  errors: string[];
};

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, "");
}

function parseCsv(content: string): Record<string, string>[] {
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
  return rows.slice(1).filter((r) => r.some((c) => c.trim())).map((r) => {
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
  if (!raw && raw !== "0") return null;
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

function pick<T>(incoming: T | null | undefined, existing: T | null | undefined): T | null | undefined {
  if (incoming === null || incoming === undefined || incoming === "") return existing;
  return incoming;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const productsPath = process.env.LIQUIDAROM_PRODUCTS_CSV || DEFAULT_PRODUCTS;
  const flavorsPath = process.env.LIQUIDAROM_FLAVORS_CSV || DEFAULT_FLAVORS;

  if (!fs.existsSync(productsPath)) {
    throw new Error(`CSV produits introuvable: ${productsPath}`);
  }
  if (!fs.existsSync(flavorsPath)) {
    throw new Error(`CSV saveurs introuvable: ${flavorsPath}`);
  }

  const productRows = parseCsv(fs.readFileSync(productsPath, "utf8"));
  const flavorRows = parseCsv(fs.readFileSync(flavorsPath, "utf8"));
  const flavorsByProductId = new Map<string, Record<string, string>>();
  for (const f of flavorRows) {
    const id = f["ID produit"];
    if (id) flavorsByProductId.set(id, f);
  }

  const stats: Stats = {
    read: productRows.length,
    created: 0,
    updated: 0,
    skipped: 0,
    unchanged: 0,
    flavorsUpserted: 0,
    withoutPrice: 0,
    withoutStock: 0,
    errors: [],
  };

  console.log(`[liquidarom] mode=${dryRun ? "DRY-RUN" : "IMPORT"} rows=${productRows.length}`);

  let dbOk = true;
  if (!dryRun) {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new Error(
        "Base PostgreSQL inaccessible (localhost:5433). Démarrez Docker : docker compose up -d"
      );
    }
  } else {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbOk = false;
      console.warn("[liquidarom] DB offline — dry-run CSV uniquement (pas de matching existant)");
    }
  }

  for (const row of productRows) {
    const externalId = row["ID produit"];
    const name = row["Nom commercial"];
    if (!externalId || !name) {
      stats.skipped++;
      stats.errors.push(`Ligne sans ID/nom: ${JSON.stringify(row).slice(0, 120)}`);
      continue;
    }

    try {
      const brandName = row["Marque"] || "Liquidarom";
      const range = row["Sous-catégorie"] || null;
      const categorySlug = mapCategory(row["Catégorie"] || "E-liquide");
      const categoryName = row["Catégorie"] || "E-liquides";
      const barcode = row["Code-barres / SKU"] || null;
      const priceCents = parsePriceEuros(row["Prix vente TTC (€)"]);
      const stockTotal = parseStock(row["Stock total"]);
      const nicotineMg = parseNicotine(row["Taux nicotine (mg/ml)"]);
      const capacityRaw = row["Format / Contenance"] || "";
      const capacityMatch = capacityRaw.match(/(\d+(?:[.,]\d+)?)\s*ml/i);
      const capacityMl = capacityMatch ? parseFloat(capacityMatch[1].replace(",", ".")) : null;
      const description =
        row["Description complète"] || row["Description courte"] || null;
      const shortDesc = row["Description courte"] || null;
      const activeBoutique = yes(row["Actif en boutique"]);
      const activeOnline = yes(row["Actif en ligne"]);
      // Catalogue public filtre isActive — publier si actif boutique (mission correction)
      const isActive = activeBoutique || activeOnline;
      const visibleOnline = activeOnline || activeBoutique;
      const normalizedName = normalizeProductName(name);
      const specs = extractExplicitSpecs(`${name} ${capacityRaw} ${description || ""}`);
      const slugBase = slugify(`${brandName}-${name}-${capacityRaw || externalId}`);
      const sku = externalId;

      if (priceCents == null) stats.withoutPrice++;
      if (stockTotal == null) stats.withoutStock++;

      if (dryRun) {
        if (!dbOk) {
          stats.created++;
          continue;
        }
        try {
          const existing = await prisma.product.findFirst({
            where: {
              OR: [
                { sku },
                ...(barcode ? [{ barcode }] : []),
                { normalizedName },
              ],
            },
          });
          if (existing) stats.updated++;
          else stats.created++;
        } catch {
          stats.created++;
        }
        continue;
      }

      const brand = await ensureBrand(brandName);
      const category = await ensureCategory(categorySlug, categoryName === "E-liquide" ? "E-liquides" : categoryName);

      const existing = await prisma.product.findFirst({
        where: {
          OR: [
            { sku },
            ...(barcode ? [{ barcode }] : []),
            { AND: [{ brand: brandName }, { normalizedName }] },
          ],
        },
        include: { flavors: true, variants: true, stockLevels: true },
      });

      // Ne pas écraser un stock SumUp existant
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
          : existing?.stock ?? 0;

      const data = {
        sku,
        name: pick(name, existing?.name) as string,
        normalizedName,
        description: (pick(description, existing?.description) as string | null) ?? null,
        category: categorySlug,
        subcategory: range,
        brand: brandName,
        range,
        productType: row["Type de produit"] || null,
        categoryId: category.id,
        brandId: brand.id,
        barcode: (pick(barcode, existing?.barcode) as string | null) ?? null,
        priceCents: nextPrice,
        stock: nextStock,
        source: existing?.source === "sumup" ? "sumup" : "liquidarom",
        isActive,
        visibleOnline,
        slug: existing?.slug || slugBase,
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
            // ne jamais remplacer une valeur existante par vide
            description: data.description || existing.description,
            barcode: data.barcode || existing.barcode,
            imageUrl: existing.imageUrl,
          },
        });
        productId = existing.id;
        if (changed) stats.updated++;
        else stats.unchanged++;
      } else {
        // éviter collision slug
        let slug = slugBase;
        let n = 1;
        while (await prisma.product.findUnique({ where: { slug } })) {
          slug = `${slugBase}-${n++}`;
        }
        const created = await prisma.product.create({
          data: { ...data, slug, images: [] },
        });
        productId = created.id;
        stats.created++;
      }

      // Variante nicotine / contenance
      const variantName = [
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
            sku: sku,
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
            active: true,
          },
        });
      }

      // Profil saveur
      const flavorRow = flavorsByProductId.get(externalId);
      if (flavorRow) {
        const existingFlavor = await prisma.productFlavor.findFirst({
          where: { productId },
        });
        const flavorData = {
          primaryFlavor: flavorRow["Saveur principale"] || null,
          secondaryFlavor: flavorRow["Saveur secondaire 1"] || null,
          flavorFamily: flavorRow["Famille de goût"] || null,
          isFresh: freshnessLevel(flavorRow["Frais / glacé"]),
          isFruity: (flavorRow["Famille de goût"] || "").toLowerCase().includes("fruit"),
          isGourmet: (flavorRow["Famille de goût"] || "").toLowerCase().includes("gourmand"),
          isMint: (flavorRow["Famille de goût"] || "").toLowerCase().includes("menthe"),
          isTobacco: (flavorRow["Famille de goût"] || "").toLowerCase().includes("tabac"),
          validatedManually: /valid/i.test(flavorRow["Statut validation"] || ""),
          confidenceScore: 0.9,
        };

        if (existingFlavor) {
          await prisma.productFlavor.update({
            where: { id: existingFlavor.id },
            data: {
              primaryFlavor: flavorData.primaryFlavor || existingFlavor.primaryFlavor,
              secondaryFlavor: flavorData.secondaryFlavor || existingFlavor.secondaryFlavor,
              flavorFamily: flavorData.flavorFamily || existingFlavor.flavorFamily,
              isFresh: flavorData.isFresh ?? existingFlavor.isFresh,
              isFruity: flavorData.isFruity ?? existingFlavor.isFruity,
              isGourmet: flavorData.isGourmet ?? existingFlavor.isGourmet,
              isMint: flavorData.isMint ?? existingFlavor.isMint,
              isTobacco: flavorData.isTobacco ?? existingFlavor.isTobacco,
            },
          });
        } else {
          await prisma.productFlavor.create({
            data: { productId, ...flavorData },
          });
        }
        stats.flavorsUpserted++;
      }
    } catch (err) {
      stats.skipped++;
      stats.errors.push(`${externalId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(JSON.stringify(stats, null, 2));
  if (stats.errors.length) {
    console.log("[liquidarom] erreurs (max 20):");
    stats.errors.slice(0, 20).forEach((e) => console.log(" -", e));
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
