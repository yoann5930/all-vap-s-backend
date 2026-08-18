/**
 * Import unifié catalogue — CSV, Excel (via export inverse), images.
 * Met à jour sans doublons (sku, reference, barcode, slug).
 */
import prisma from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { normalizeProductName } from "@/lib/catalog/normalize";
import { parseSemicolonCsv } from "@/lib/catalog/liquidarom-import";
import { matchRangeSlugFromText, ensureLiquidaromRanges } from "@/lib/catalog/ranges";
import { ensureProductImageEtastyStyle } from "@/lib/catalog/normalize-product-image";

export type UnifiedImportStats = {
  read: number;
  created: number;
  updated: number;
  skipped: number;
  imagesAttached: number;
  errors: string[];
};

function parsePgVg(raw: string | undefined): { pg?: number; vg?: number; label?: string } {
  if (!raw) return {};
  const label = raw.trim();
  const m = label.match(/(\d+)\s*\/\s*(\d+)/);
  if (m) return { pg: parseInt(m[1], 10), vg: parseInt(m[2], 10), label };
  if (/100\s*%?\s*vg/i.test(label)) return { pg: 0, vg: 100, label: "100% VG" };
  return { label };
}

async function findExistingProduct(row: Record<string, string>) {
  const sku = row.sku || row.reference || row["ID produit"] || row["Code-barres / SKU"];
  const barcode = row.ean || row.barcode || row["Code-barres / SKU"];
  const slug = row.slug ? slugify(row.slug) : null;

  if (sku) {
    const bySku = await prisma.product.findFirst({ where: { sku } });
    if (bySku) return bySku;
  }
  if (barcode && /^\d{8,14}$/.test(barcode.replace(/\D/g, ""))) {
    const byEan = await prisma.product.findFirst({ where: { barcode } });
    if (byEan) return byEan;
  }
  if (slug) {
    const bySlug = await prisma.product.findFirst({ where: { slug } });
    if (bySlug) return bySlug;
  }
  const name = row.nom || row.name || row["Nom commercial"];
  if (name) {
    const norm = normalizeProductName(name);
    const byNorm = await prisma.product.findFirst({ where: { normalizedName: norm } });
    if (byNorm) return byNorm;
  }
  return null;
}

export async function importCatalogCsv(content: string, dryRun = false): Promise<UnifiedImportStats> {
  const stats: UnifiedImportStats = {
    read: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    imagesAttached: 0,
    errors: [],
  };

  const delimiter = content.includes(";") && content.split("\n")[0]?.includes(";") ? ";" : ",";
  const rows: Record<string, string>[] =
    delimiter === ";"
      ? parseSemicolonCsv(content)
      : content
          .trim()
          .split(/\r?\n/)
          .slice(1)
          .map((line) => {
            const cols = line.split(",");
            return { nom: cols[0]?.trim() ?? "", sku: cols[1]?.trim() ?? "", brand: cols[2]?.trim() ?? "" };
          });

  await ensureLiquidaromRanges();

  for (const row of rows) {
    stats.read++;
    try {
      const name = row.nom || row.name || row["Nom commercial"];
      if (!name) {
        stats.skipped++;
        continue;
      }

      const existing = await findExistingProduct(row);
      const brandName = row.fabricant || row.marque || row.brand || row.Marque || "Liquidarom";
      const rangeText = row.gamme || row.range || row["Sous-catégorie"] || "";
      const rangeSlug = matchRangeSlugFromText(`${name} ${rangeText}`);
      let rangeId: string | null = null;
      if (rangeSlug) {
        const brand = await prisma.brand.findFirst({ where: { slug: slugify(brandName) } });
        if (brand) {
          const range = await prisma.productRange.findFirst({
            where: { brandId: brand.id, slug: rangeSlug },
          });
          rangeId = range?.id ?? null;
        }
      }

      const data = {
        name,
        normalizedName: normalizeProductName(name),
        slug: existing?.slug ?? slugify(name),
        reference: row.reference || row["ID produit"] || null,
        sku: row.sku || row.reference || row["ID produit"] || existing?.sku || null,
        barcode: row.ean || row.barcode || null,
        brand: brandName,
        range: rangeText || null,
        rangeId,
        category: row.categorie || row.category || row.Catégorie || "e-liquides",
        shortDescription: row["Description courte"] || row.shortDescription || null,
        longDescription: row["Description complète"] || row.longDescription || null,
        description:
          row.description ||
          [row["Description courte"], row["Description complète"]].filter(Boolean).join("\n\n") ||
          null,
        source: "import",
        visibleOnline: true,
        isActive: true,
      };

      if (dryRun) {
        existing ? stats.updated++ : stats.created++;
        continue;
      }

      let productId: string;
      if (existing) {
        await prisma.product.update({ where: { id: existing.id }, data });
        productId = existing.id;
        stats.updated++;
      } else {
        const created = await prisma.product.create({
          data: { ...data, priceCents: 0, stock: 0 },
        });
        productId = created.id;
        stats.created++;
      }

      const photoUrl = row.photo || row.imageUrl || row["Photo principale"];
      if (photoUrl && !/group|rayon|hero|banner/i.test(photoUrl)) {
        const normalizedUrl = await ensureProductImageEtastyStyle({
          sourceUrl: photoUrl,
          productName: name,
          brand: brandName,
          rangeSlug: rangeSlug || rangeText || undefined,
          format: row.format || undefined,
          productSlug: data.slug,
        });
        const existingImg = await prisma.productImage.findFirst({
          where: { productId, sortOrder: 0 },
        });
        const imgStatus = row.imageStatus === "validated" ? "validated" : "pending";
        if (existingImg) {
          await prisma.productImage.update({
            where: { id: existingImg.id },
            data: { url: normalizedUrl, status: imgStatus },
          });
        } else {
          await prisma.productImage.create({
            data: { productId, url: normalizedUrl, status: imgStatus, sortOrder: 0 },
          });
        }
        await prisma.product.update({
          where: { id: productId },
          data: {
            imageUrl: normalizedUrl,
            imageStatus: row.imageStatus === "validated" ? "validated" : "pending",
          },
        });
        stats.imagesAttached++;
      }

      const pgvg = parsePgVg(row["Ratio PG/VG"] || row.pgvg);
      const nicotineRaw = row.nicotine || row["Taux nicotine (mg/ml)"];
      const nicotineMg = nicotineRaw ? parseFloat(nicotineRaw.replace(",", ".")) : null;

      await prisma.productVariant.upsert({
        where: { id: `var_default_${productId}` },
        create: {
          id: `var_default_${productId}`,
          productId,
          name: "Standard",
          nicotineMg: Number.isFinite(nicotineMg!) ? nicotineMg : null,
          pgRatio: pgvg.pg,
          vgRatio: pgvg.vg,
          pgVgLabel: pgvg.label,
          capacityMl: row.format ? parseFloat(String(row.format).replace(/[^\d.]/g, "")) : 50,
          active: true,
        },
        update: {
          nicotineMg: Number.isFinite(nicotineMg!) ? nicotineMg : undefined,
          pgRatio: pgvg.pg,
          vgRatio: pgvg.vg,
          pgVgLabel: pgvg.label,
        },
      });
    } catch (err) {
      stats.errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return stats;
}

export async function attachProductImage(params: {
  productId: string;
  url: string;
  status?: "official" | "pending" | "validated";
  sortOrder?: number;
}) {
  if (/group|rayon|hero|banner|selection/i.test(params.url)) {
    throw new Error("Photo de groupe refusée — bouteille seule uniquement");
  }

  const product = await prisma.product.findUnique({
    where: { id: params.productId },
    select: {
      name: true,
      brand: true,
      slug: true,
      range: true,
      productType: true,
      manufacturer: { select: { slug: true, name: true } },
      rangeRef: { select: { slug: true } },
    },
  });
  if (!product) throw new Error("Produit introuvable");

  // Style e-tasty OBLIGATOIRE avant liaison DB
  const normalizedUrl = await ensureProductImageEtastyStyle({
    sourceUrl: params.url,
    productName: product.name,
    brand: product.brand || product.manufacturer?.name,
    manufacturerSlug: product.manufacturer?.slug,
    rangeSlug: product.rangeRef?.slug || product.range,
    format: product.productType,
    productSlug: product.slug,
  });

  const image = await prisma.productImage.create({
    data: {
      productId: params.productId,
      url: normalizedUrl,
      status: params.status ?? "pending",
      sortOrder: params.sortOrder ?? 0,
    },
  });

  if (params.status === "validated" || params.status === "official") {
    await prisma.product.update({
      where: { id: params.productId },
      data: { imageUrl: normalizedUrl, imageStatus: params.status },
    });
  }

  return image;
}
