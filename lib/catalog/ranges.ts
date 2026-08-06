import prisma from "@/lib/prisma";
import { slugify } from "@/lib/utils";

/** Gammes Liquidarom initiales — extensibles via admin/DB sans modifier le code */
export const LIQUIDAROM_RANGE_SEED = [
  { name: "Ice Cool", slug: "ice-cool", sortOrder: 1 },
  { name: "Ice Cool X", slug: "ice-cool-x", sortOrder: 2 },
  { name: "Les Collègues", slug: "les-collegues", sortOrder: 3 },
  { name: "Les Essentiels", slug: "les-essentiels", sortOrder: 4 },
  { name: "Edition Collection", slug: "edition-collection", sortOrder: 5 },
  { name: "Edition Collector", slug: "edition-collector", sortOrder: 6 },
] as const;

export async function ensureLiquidaromRanges() {
  const brand = await prisma.brand.upsert({
    where: { slug: "liquidarom" },
    create: { name: "Liquidarom", slug: "liquidarom", isActive: true },
    update: { isActive: true },
  });

  for (const range of LIQUIDAROM_RANGE_SEED) {
    await prisma.productRange.upsert({
      where: { brandId_slug: { brandId: brand.id, slug: range.slug } },
      create: {
        brandId: brand.id,
        name: range.name,
        slug: range.slug,
        sortOrder: range.sortOrder,
        isActive: true,
      },
      update: { name: range.name, sortOrder: range.sortOrder, isActive: true },
    });
  }

  return brand;
}

export function matchRangeSlugFromText(text: string): string | null {
  const t = text.toLowerCase();
  for (const r of LIQUIDAROM_RANGE_SEED) {
    if (t.includes(r.slug.replace(/-/g, " ")) || t.includes(r.name.toLowerCase())) {
      return r.slug;
    }
  }
  if (/ice\s*cool\s*x/i.test(t)) return "ice-cool-x";
  if (/ice\s*cool/i.test(t)) return "ice-cool";
  if (/coll[eè]gues/i.test(t)) return "les-collegues";
  if (/essentiels/i.test(t)) return "les-essentiels";
  if (/edition\s+collection/i.test(t)) return "edition-collection";
  if (/collector|miss\s*blue/i.test(t)) return "edition-collection";
  return null;
}

export function normalizeRangeSlug(input: string): string {
  return slugify(input);
}
