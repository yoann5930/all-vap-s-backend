import prisma from "@/lib/prisma";

/**
 * Prix par gamme : un tarif saisi pour une gamme s'applique
 * à tous les produits catalogue ayant la même gamme (et marque si fournie).
 */

export function normalizeRangeKey(range: string): string {
  return range.trim().replace(/\s+/g, " ");
}

/** Cherche un prix déjà connu pour cette gamme (produits catalogue). */
export async function findRangeUnitPriceCents(params: {
  range: string;
  brand?: string | null;
}): Promise<{ cents: number; sampleProductId: string | null } | null> {
  const range = normalizeRangeKey(params.range);
  if (!range) return null;

  const product = await prisma.product.findFirst({
    where: {
      range: { equals: range, mode: "insensitive" },
      ...(params.brand
        ? { brand: { equals: params.brand.trim(), mode: "insensitive" } }
        : {}),
      priceCents: { gt: 0 },
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, priceCents: true },
  });

  if (!product || product.priceCents <= 0) return null;
  return { cents: product.priceCents, sampleProductId: product.id };
}

/** Applique un prix unitaire à tous les produits de la gamme. */
export async function applyUnitPriceToRange(params: {
  range: string;
  brand?: string | null;
  unitPriceCents: number;
}): Promise<{ updated: number; range: string }> {
  const range = normalizeRangeKey(params.range);
  if (!range) return { updated: 0, range };
  if (params.unitPriceCents < 0) return { updated: 0, range };

  const result = await prisma.product.updateMany({
    where: {
      range: { equals: range, mode: "insensitive" },
      ...(params.brand
        ? { brand: { equals: params.brand.trim(), mode: "insensitive" } }
        : {}),
    },
    data: {
      priceCents: params.unitPriceCents,
      promoPriceCents: null,
    },
  });

  return { updated: result.count, range };
}
