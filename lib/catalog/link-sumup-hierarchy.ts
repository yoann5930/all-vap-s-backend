/**
 * Relie automatiquement un produit SumUp déjà en base à Fabricant → Gamme.
 * Ne crée JAMAIS de fabricant/gamme inventés — uniquement matching sur référentiel existant.
 */
import prisma from "@/lib/prisma";

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return norm(s).split(/\s+/).filter((t) => t.length > 1);
}

function scoreOverlap(haystack: string, needle: string): number {
  const h = norm(haystack);
  const n = norm(needle);
  if (!n) return 0;
  if (h === n) return 100;
  if (h.includes(n) || n.includes(h)) return 80;
  const ht = new Set(tokens(h));
  const nt = tokens(n);
  if (nt.length === 0) return 0;
  const hit = nt.filter((t) => ht.has(t)).length;
  return Math.round((hit / nt.length) * 70);
}

export type HierarchyLinkResult = {
  scanned: number;
  linkedManufacturer: number;
  linkedRange: number;
  unchanged: number;
  skippedNoMatch: number;
};

/**
 * Pour les produits liés SumUp sans manufacturerId/rangeId :
 * tente d’associer via brand / nom / sumupName aux Manufacturer + ProductRange existants.
 */
export async function linkSumUpProductsToCatalogHierarchy(params?: {
  onlyMissing?: boolean;
  limit?: number;
}): Promise<HierarchyLinkResult> {
  const onlyMissing = params?.onlyMissing !== false;
  const manufacturers = await prisma.manufacturer.findMany({
    where: { isActive: true },
    include: {
      ranges: { where: { isActive: true }, select: { id: true, name: true, slug: true, manufacturerId: true } },
    },
  });

  const products = await prisma.product.findMany({
    where: {
      OR: [
        { sumupProductId: { not: null } },
        { source: { in: ["sumup_csv", "sumup"] } },
      ],
      ...(onlyMissing
        ? {
            OR: [{ manufacturerId: null }, { rangeId: null }],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      sumupName: true,
      brand: true,
      manufacturerId: true,
      rangeId: true,
      brandRef: { select: { name: true, manufacturerId: true } },
    },
    take: params?.limit ?? 5000,
  });

  let linkedManufacturer = 0;
  let linkedRange = 0;
  let unchanged = 0;
  let skippedNoMatch = 0;

  for (const p of products) {
    const hay = [p.sumupName, p.name, p.brand, p.brandRef?.name].filter(Boolean).join(" ");
    let manufacturerId = p.manufacturerId;
    let rangeId = p.rangeId;

    if (!manufacturerId && p.brandRef?.manufacturerId) {
      manufacturerId = p.brandRef.manufacturerId;
    }

    if (!manufacturerId) {
      let best: { id: string; score: number } | null = null;
      for (const m of manufacturers) {
        const score = Math.max(
          scoreOverlap(hay, m.name),
          scoreOverlap(hay, m.slug.replace(/-/g, " "))
        );
        if (score >= 70 && (!best || score > best.score)) {
          best = { id: m.id, score };
        }
      }
      if (best) manufacturerId = best.id;
    }

    const mfr = manufacturers.find((m) => m.id === manufacturerId);
    if (mfr && !rangeId) {
      let bestRange: { id: string; score: number } | null = null;
      for (const r of mfr.ranges) {
        const score = Math.max(
          scoreOverlap(hay, r.name),
          scoreOverlap(hay, r.slug.replace(/-/g, " "))
        );
        // Exige un score plus haut pour les gammes (éviter mélange)
        if (score >= 75 && (!bestRange || score > bestRange.score)) {
          bestRange = { id: r.id, score };
        }
      }
      if (bestRange) rangeId = bestRange.id;
    }

    // Sécurité : la gamme doit appartenir au même fabricant
    if (rangeId && manufacturerId) {
      const ok = mfr?.ranges.some((r) => r.id === rangeId);
      if (!ok) rangeId = p.rangeId;
    }

    if (
      manufacturerId === p.manufacturerId &&
      rangeId === p.rangeId
    ) {
      if (!manufacturerId && !rangeId) skippedNoMatch++;
      else unchanged++;
      continue;
    }

    await prisma.product.update({
      where: { id: p.id },
      data: {
        ...(manufacturerId && manufacturerId !== p.manufacturerId
          ? { manufacturerId }
          : {}),
        ...(rangeId && rangeId !== p.rangeId ? { rangeId } : {}),
      },
    });

    if (manufacturerId && manufacturerId !== p.manufacturerId) linkedManufacturer++;
    if (rangeId && rangeId !== p.rangeId) linkedRange++;
  }

  return {
    scanned: products.length,
    linkedManufacturer,
    linkedRange,
    unchanged,
    skippedNoMatch,
  };
}
