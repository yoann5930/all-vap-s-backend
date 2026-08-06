/**
 * Règle OBLIGATOIRE catalogue All Vap's — INTERDICTION DE DOUBLON PRODUIT.
 *
 * Avant toute création / publication :
 * 1) Contrôler les doublons (SumUp ID, slug, barcode EN13, range+nom+format)
 * 2) Pas de doublon → intégrer (préférer UPDATE de la fiche SumUp existante)
 * 3) Doublon détecté → NE PAS CRÉER ; quarantiner le surplus hors ligne
 *
 * Unicité produit :
 *   rangeId + normalizedProductName + format(volumeMl)
 *   + sumupProductId unique
 *   + barcode EN13 unique (si présent)
 *   + slug unique
 */
import type { PrismaClient, Product } from "@prisma/client";

export type DuplicateReason =
  | "sumupProductId"
  | "slug"
  | "barcode"
  | "official_handle"
  | "flavor_format"
  | "range_name_format";

export type DuplicateHit = {
  reason: DuplicateReason;
  key: string;
  productIds: string[];
  names: string[];
};

export function normalizeCatalogKey(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Clé d'unicité produit dans une gamme : nom normalisé + format ml. */
export function productUniquenessKey(params: {
  rangeId?: string | null;
  manufacturerId?: string | null;
  name: string;
  volumeMl?: number | null;
}): string {
  const scope = params.rangeId || params.manufacturerId || "orphan";
  const name = normalizeCatalogKey(params.name);
  const vol =
    params.volumeMl != null && Number.isFinite(params.volumeMl)
      ? String(params.volumeMl)
      : "na";
  return `${scope}::${name}::${vol}`;
}

/** Refuse d'intégrer si la clé officielle / SumUp est déjà retenue dans ce run. */
export function registerOrRejectDuplicate(
  seen: Set<string>,
  key: string | null | undefined,
  label: string
): { ok: true } | { ok: false; reason: string } {
  if (!key) return { ok: false, reason: `cle_vide_${label}` };
  if (seen.has(key)) return { ok: false, reason: `doublon_${label}_${key}` };
  seen.add(key);
  return { ok: true };
}

/**
 * Quarantaine un produit détecté comme doublon :
 * - jamais visible en ligne
 * - statut a_verifier
 * - anomalie import renseignée
 */
export async function quarantineDuplicateProduct(
  prisma: PrismaClient,
  productId: string,
  reason: string
): Promise<void> {
  await prisma.product.update({
    where: { id: productId },
    data: {
      visibleOnline: false,
      isActive: false,
      catalogStatus: "a_verifier",
      importAnomaly: `doublon_refuse_integration:${reason}`.slice(0, 240),
    },
  });
}

type Slim = Pick<
  Product,
  | "id"
  | "name"
  | "slug"
  | "sumupProductId"
  | "visibleOnline"
  | "volumeMl"
  | "productFamily"
  | "barcode"
  | "rangeId"
  | "normalizedName"
  | "source"
  | "isActive"
>;

function pushGroup(
  hits: DuplicateHit[],
  reason: DuplicateReason,
  key: string,
  items: Slim[]
) {
  if (items.length < 2) return;
  hits.push({
    reason,
    key,
    productIds: items.map((i) => i.id),
    names: items.map((i) => i.name),
  });
}

/** Détecte doublons SumUp / slug / barcode / range+nom+format. */
export function findDuplicateGroups(products: Slim[]): DuplicateHit[] {
  const hits: DuplicateHit[] = [];

  const bySumup = new Map<string, Slim[]>();
  const bySlug = new Map<string, Slim[]>();
  const byBarcode = new Map<string, Slim[]>();
  const byRangeNameFormat = new Map<string, Slim[]>();

  for (const p of products) {
    if (p.sumupProductId) {
      const list = bySumup.get(p.sumupProductId) || [];
      list.push(p);
      bySumup.set(p.sumupProductId, list);
    }

    const slugList = bySlug.get(p.slug) || [];
    slugList.push(p);
    bySlug.set(p.slug, slugList);

    const barcode = (p.barcode || "").trim();
    if (barcode.length >= 8) {
      const list = byBarcode.get(barcode) || [];
      list.push(p);
      byBarcode.set(barcode, list);
    }

    const nameKey = normalizeCatalogKey(p.normalizedName || p.name);
    if (p.rangeId && nameKey) {
      const k = productUniquenessKey({
        rangeId: p.rangeId,
        name: nameKey,
        volumeMl: p.volumeMl,
      });
      const list = byRangeNameFormat.get(k) || [];
      list.push(p);
      byRangeNameFormat.set(k, list);
    }
  }

  for (const [key, items] of bySumup) pushGroup(hits, "sumupProductId", key, items);
  for (const [key, items] of bySlug) pushGroup(hits, "slug", key, items);
  for (const [key, items] of byBarcode) pushGroup(hits, "barcode", key, items);
  for (const [key, items] of byRangeNameFormat) {
    pushGroup(hits, "range_name_format", key, items);
  }

  return hits;
}

/**
 * Choisit le produit à CONSERVER dans un groupe de doublons.
 * Priorité : SumUp lié > visible online > source non official_catalog > plus ancien.
 */
export function pickCanonicalDuplicate(items: Slim[]): {
  keep: Slim;
  drop: Slim[];
} {
  const ranked = [...items].sort((a, b) => {
    const score = (p: Slim) =>
      (p.sumupProductId ? 1000 : 0) +
      (p.visibleOnline ? 100 : 0) +
      (p.isActive ? 10 : 0) +
      (p.source === "official_catalog" ? -50 : 0);
    return score(b) - score(a);
  });
  const [keep, ...drop] = ranked;
  return { keep, drop };
}

/** Fail-fast si des doublons sont déjà en ligne pour une famille. */
export async function assertNoOnlineDuplicates(
  prisma: PrismaClient,
  opts: { productFamily: string; rangeName: string }
): Promise<void> {
  const online = await prisma.product.findMany({
    where: {
      visibleOnline: true,
      OR: [
        { productFamily: opts.productFamily },
        { range: { equals: opts.rangeName, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      slug: true,
      sumupProductId: true,
      visibleOnline: true,
      volumeMl: true,
      productFamily: true,
      barcode: true,
      rangeId: true,
      normalizedName: true,
      source: true,
      isActive: true,
    },
  });

  const hits = findDuplicateGroups(online);
  if (hits.length) {
    const detail = hits
      .map((h) => `${h.reason}:${h.key} → ${h.names.join(" | ")}`)
      .join("\n");
    throw new Error(
      `DOUBLONS EN LIGNE DÉTECTÉS (${opts.rangeName}) — intégration refusée.\n${detail}`
    );
  }

  const sumups = online.map((o) => o.sumupProductId).filter(Boolean) as string[];
  if (new Set(sumups).size !== sumups.length) {
    throw new Error(`DOUBLONS sumupProductId en ligne — ${opts.rangeName}`);
  }
}

export type ExistingProductMatch = {
  id: string;
  name: string;
  sumupProductId: string | null;
  visibleOnline: boolean;
  matchReason: DuplicateReason | "name_contains";
};

/**
 * OBLIGATOIRE avant tout `product.create`.
 * Retourne le produit existant à fusionner, ou null si création autorisée.
 */
export async function findExistingProductBeforeCreate(
  prisma: PrismaClient,
  params: {
    name: string;
    volumeMl?: number | null;
    rangeId?: string | null;
    manufacturerId?: string | null;
    sumupProductId?: string | null;
    barcode?: string | null;
    slug?: string | null;
  }
): Promise<ExistingProductMatch | null> {
  if (params.sumupProductId) {
    const bySumup = await prisma.product.findFirst({
      where: { sumupProductId: params.sumupProductId },
      select: {
        id: true,
        name: true,
        sumupProductId: true,
        visibleOnline: true,
      },
    });
    if (bySumup) {
      return { ...bySumup, matchReason: "sumupProductId" };
    }
  }

  if (params.barcode && params.barcode.trim().length >= 8) {
    const byBarcode = await prisma.product.findFirst({
      where: { barcode: params.barcode.trim() },
      select: {
        id: true,
        name: true,
        sumupProductId: true,
        visibleOnline: true,
      },
    });
    if (byBarcode) {
      return { ...byBarcode, matchReason: "barcode" };
    }
  }

  if (params.slug) {
    const bySlug = await prisma.product.findFirst({
      where: { slug: params.slug },
      select: {
        id: true,
        name: true,
        sumupProductId: true,
        visibleOnline: true,
      },
    });
    if (bySlug) {
      return { ...bySlug, matchReason: "slug" };
    }
  }

  const norm = normalizeCatalogKey(params.name);
  if (params.rangeId && norm) {
    const inRange = await prisma.product.findMany({
      where: { rangeId: params.rangeId },
      select: {
        id: true,
        name: true,
        sumupProductId: true,
        visibleOnline: true,
        volumeMl: true,
        normalizedName: true,
      },
      take: 2000,
    });
    const hit = inRange.find((p) => {
      const pNorm = normalizeCatalogKey(p.normalizedName || p.name);
      const sameName =
        pNorm === norm || pNorm.includes(norm) || norm.includes(pNorm);
      const sameVol =
        params.volumeMl == null ||
        p.volumeMl == null ||
        p.volumeMl === params.volumeMl;
      return sameName && sameVol;
    });
    if (hit) {
      return {
        id: hit.id,
        name: hit.name,
        sumupProductId: hit.sumupProductId,
        visibleOnline: hit.visibleOnline,
        matchReason: "range_name_format",
      };
    }
  }

  // Recherche SumUp globale (nom + format) — jamais créer un 2e si SumUp existe
  if (norm.length >= 3) {
    const candidates = await prisma.product.findMany({
      where: {
        sumupProductId: { not: null },
        ...(params.volumeMl != null ? { volumeMl: params.volumeMl } : {}),
        ...(params.manufacturerId
          ? { manufacturerId: params.manufacturerId }
          : {}),
      },
      select: {
        id: true,
        name: true,
        sumupName: true,
        sumupProductId: true,
        visibleOnline: true,
        normalizedName: true,
        volumeMl: true,
      },
      take: 3000,
    });
    const hit = candidates.find((p) => {
      const hay = normalizeCatalogKey(
        [p.normalizedName, p.name, p.sumupName].filter(Boolean).join(" ")
      );
      return hay.includes(norm) || norm.includes(normalizeCatalogKey(p.name));
    });
    if (hit) {
      return {
        id: hit.id,
        name: hit.name,
        sumupProductId: hit.sumupProductId,
        visibleOnline: hit.visibleOnline,
        matchReason: "name_contains",
      };
    }
  }

  return null;
}

/** Scan complet DB — tous produits (online + offline). */
export async function scanAllProductDuplicates(prisma: PrismaClient): Promise<{
  hits: DuplicateHit[];
  onlineHits: DuplicateHit[];
  totalProducts: number;
}> {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      sumupProductId: true,
      visibleOnline: true,
      volumeMl: true,
      productFamily: true,
      barcode: true,
      rangeId: true,
      normalizedName: true,
      source: true,
      isActive: true,
    },
  });
  const hits = findDuplicateGroups(products);
  const online = products.filter((p) => p.visibleOnline && p.isActive);
  const onlineHits = findDuplicateGroups(online);
  return { hits, onlineHits, totalProducts: products.length };
}
