import prisma from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { CATALOG_CATEGORIES } from "@/lib/catalog/categories";

export interface CsvProductRow {
  name: string;
  slug?: string;
  sku?: string;
  category: string;
  brand?: string;
  priceCents: number;
  promoPriceCents?: number;
  stock: number;
  description?: string;
  imageUrl?: string;
  images?: string[];
  isPromo?: boolean;
  isNew?: boolean;
  isBestSeller?: boolean;
  isActive?: boolean;
}

/** Parse CSV simple (séparateur virgule, champs entre guillemets) */
export function parseCsv(content: string): Record<string, string>[] {
  const lines = content.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx]?.trim() ?? "";
    });
    rows.push(row);
  }

  return rows;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map((s) => s.replace(/^"|"$/g, "").trim());
}

export function csvRowToProduct(row: Record<string, string>): CsvProductRow | null {
  const name = row.name || row.nom;
  const category = row.category || row.categorie || row.cat;
  const priceRaw = row.pricecents || row.prix || row.price;

  if (!name || !category || !priceRaw) return null;

  const priceCents = Math.round(parseFloat(priceRaw.replace(",", ".")) * (priceRaw.includes(".") && parseFloat(priceRaw) < 1000 ? 100 : 1));
  const promoRaw = row.promopricecents || row.prixpromo || row.promo;
  const promoPriceCents = promoRaw ? Math.round(parseFloat(promoRaw.replace(",", ".")) * (promoRaw.includes(".") && parseFloat(promoRaw) < 1000 ? 100 : 1)) : undefined;

  return {
    name,
    slug: row.slug || undefined,
    sku: row.sku || undefined,
    category: category.toLowerCase().replace(/\s+/g, "-"),
    brand: row.brand || row.marque || undefined,
    priceCents: isNaN(priceCents) ? 0 : priceCents,
    promoPriceCents,
    stock: parseInt(row.stock || "0", 10) || 0,
    description: row.description || row.desc || undefined,
    imageUrl: row.imageurl || row.image || undefined,
    images: row.images ? row.images.split("|").filter(Boolean) : undefined,
    isPromo: row.ispromo === "true" || row.ispromo === "1" || !!promoPriceCents,
    isNew: row.isnew === "true" || row.isnew === "1",
    isBestSeller: row.isbestseller === "true" || row.isbestseller === "1",
    isActive: row.isactive !== "false" && row.isactive !== "0",
  };
}

export async function ensureCategoriesExist() {
  for (const cat of CATALOG_CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, description: cat.description, sortOrder: cat.sortOrder },
      create: {
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        sortOrder: cat.sortOrder,
      },
    });
  }
}

export async function importProductsFromRows(rows: CsvProductRow[]) {
  await ensureCategoriesExist();

  const categories = await prisma.category.findMany();
  const catBySlug = Object.fromEntries(categories.map((c) => [c.slug, c.id]));

  const results = { created: 0, updated: 0, errors: [] as string[] };

  for (const row of rows) {
    try {
      if (!row.name || row.priceCents <= 0) {
        results.errors.push(`Ligne ignorée: ${row.name || "sans nom"}`);
        continue;
      }

      const slug = row.slug || slugify(row.name);
      const categoryId = catBySlug[row.category];

      const data = {
        name: row.name,
        slug,
        sku: row.sku || null,
        category: row.category,
        categoryId: categoryId || null,
        brand: row.brand || null,
        description: row.description || null,
        imageUrl: row.imageUrl || null,
        images: row.images || (row.imageUrl ? [row.imageUrl] : []),
        priceCents: row.priceCents,
        promoPriceCents: row.promoPriceCents || null,
        stock: row.stock,
        isPromo: row.isPromo ?? false,
        isNew: row.isNew ?? false,
        isBestSeller: row.isBestSeller ?? false,
        isActive: row.isActive ?? true,
      };

      const existing = await prisma.product.findFirst({
        where: { OR: [{ slug }, ...(row.sku ? [{ sku: row.sku }] : [])] },
      });

      if (existing) {
        await prisma.product.update({ where: { id: existing.id }, data });
        results.updated++;
      } else {
        await prisma.product.create({ data });
        results.created++;
      }
    } catch (err) {
      results.errors.push(`${row.name}: ${err instanceof Error ? err.message : "erreur"}`);
    }
  }

  return results;
}

export const CSV_TEMPLATE = `name,sku,category,brand,price,promoPrice,stock,description,imageUrl,isPromo,isNew,isBestSeller
Vaporesso XROS 3 Mini,AV-POD-001,pods,Vaporesso,24.90,19.90,30,Pod compact 1000mAh,https://images.unsplash.com/photo-1585659722983-3a675dabf23d?w=400,true,true,false
E-liquide Pulp Blue Slush,AV-ELIQ-001,e-liquides,Pulp,19.90,14.90,50,Saveur framboise bleue 50ml,https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400,true,false,true`;
