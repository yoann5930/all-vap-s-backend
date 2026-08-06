import type { ProductForScoring } from "@/lib/recommendations/engine";
import { getPersonalizedRecommendations } from "@/lib/recommendations/engine";
import type { VapeProfileData } from "@/lib/vape-profile/types";

export interface CatalogProduct extends ProductForScoring {
  imageUrl: string | null;
  isBestSeller?: boolean;
  /** Si fourni : stock général disponible (prioritaire sur stock legacy) */
  availableQuantity?: number | null;
  stockKnown?: boolean;
}

const CATEGORY_ALIASES: Record<string, string[]> = {
  "e-liquides": ["liquide", "e-liquid", "eliquide", "juice", "saveur", "e liquide"],
  pods: ["pod", "cartouche"],
  "cigarettes-electroniques": ["cigarette", "kit", "aio", "starter", "début", "debut", "puff"],
  resistances: ["résistance", "resistance", "coil", "mesh"],
  accu: ["accu", "batterie", "18650", "21700"],
  chargeurs: ["chargeur", "charger"],
  diy: ["diy", "base", "arôme", "arome"],
  accessoires: ["accessoire", "drip tip", "coton"],
  box: ["box", "mod"],
  clearomiseurs: ["clearo", "atomiseur", "tank", "clearomiseur"],
};

/** Expressions saveur / produit fréquentes (boost phrase exacte) */
const PHRASE_BOOSTS: Array<{ pattern: RegExp; boost: number }> = [
  { pattern: /frais\s*rouges?/i, boost: 14 },
  { pattern: /fruits?\s*rouges?/i, boost: 14 },
  { pattern: /menthe\s*fra[iî]che/i, boost: 12 },
  { pattern: /\bmenthe\b/i, boost: 8 },
  { pattern: /\bmangue\b/i, boost: 8 },
  { pattern: /\bcitron\b/i, boost: 8 },
  { pattern: /\bvanille\b/i, boost: 8 },
  { pattern: /\bclassic\b/i, boost: 8 },
  { pattern: /\btabac\b/i, boost: 6 },
  { pattern: /\bpuff\b/i, boost: 10 },
  { pattern: /\bdiy\b/i, boost: 10 },
  { pattern: /vaporesso/i, boost: 12 },
  { pattern: /clearomiseur/i, boost: 8 },
  { pattern: /r[ée]sistance/i, boost: 8 },
  { pattern: /cigarette\s*[ée]lectronique/i, boost: 8 },
];

function productBlob(p: CatalogProduct): string {
  const flavorBits = [
    (p as CatalogProduct & { searchKeywords?: string }).searchKeywords,
    (p as CatalogProduct & { range?: string }).range,
    (p as CatalogProduct & { primaryFlavor?: string }).primaryFlavor,
  ];
  return `${p.name} ${p.description ?? ""} ${p.brand ?? ""} ${p.category} ${flavorBits.filter(Boolean).join(" ")}`.toLowerCase();
}

function isAvailableForOffer(p: CatalogProduct): boolean {
  // Si stock SumUp inconnu : fallback sur stock legacy produit (>0)
  const available = p.availableQuantity != null ? p.availableQuantity : p.stock;
  if (p.stockKnown === false) return available > 0;
  return available > 0;
}

export function searchCatalog(
  products: CatalogProduct[],
  query: string,
  options: { category?: string; limit?: number; promoOnly?: boolean; newOnly?: boolean } = {}
): CatalogProduct[] {
  const text = query.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  let pool = products.filter(isAvailableForOffer);

  if (options.promoOnly) pool = pool.filter((p) => p.isPromo);
  if (options.newOnly) pool = pool.filter((p) => p.isNew);

  if (options.category) {
    const cat = options.category.toLowerCase();
    pool = pool.filter(
      (p) =>
        p.category.toLowerCase().includes(cat) ||
        p.category.toLowerCase().replace(/-/g, "").includes(cat.replace(/-/g, ""))
    );
  }

  for (const [cat, aliases] of Object.entries(CATEGORY_ALIASES)) {
    if (aliases.some((a) => text.includes(a))) {
      const needle = cat.replace(/-/g, "");
      const inCat = products.filter((p) => {
        if (!isAvailableForOffer(p)) return false;
        const c = p.category.toLowerCase().replace(/-/g, "");
        return c.includes(needle) || p.category.toLowerCase() === cat || c.includes(aliases[0]);
      });
      if (inCat.length > 0) pool = inCat;
      break;
    }
  }

  const terms = text
    .split(/[\s,;.!?]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !["cherche", "veux", "voudrais", "pourrais", "avec", "dans", "notre", "votre", "liquide", "eliquide"].includes(t))
    .slice(0, 10);

  const scored = pool.map((p) => {
    const blob = productBlob(p);
    const blobNorm = blob.normalize("NFD").replace(/\p{M}/gu, "");
    let score = 0;

    for (const term of terms) {
      if (blobNorm.includes(term)) score += 3;
      if (p.name.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").includes(term)) score += 2;
      if ((p.brand ?? "").toLowerCase().includes(term)) score += 4;
    }

    for (const { pattern, boost } of PHRASE_BOOSTS) {
      if (pattern.test(text) && pattern.test(blob)) score += boost;
    }

    if (/fruit/i.test(text) && /fruit|berry|mangue|ananas|cerise|fraise|framboise/i.test(blob)) score += 5;
    if (/frais|menthol|ice/i.test(text) && /frais|menthe|ice|heisenberg|fresh/i.test(blob)) score += 5;
    if (/gourmand/i.test(text) && /gourmand|vanille|caramel|tarte|dessert/i.test(blob)) score += 5;
    if (/classic|tabac/i.test(text) && /classic|tabac|ry4/i.test(blob)) score += 5;
    if (/r[ée]sistance|coil/i.test(text) && /r[ée]sistance|coil|mesh/i.test(blob)) score += 6;
    if (/pod/i.test(text) && /pod/i.test(blob)) score += 4;
    if (/puff/i.test(text) && /puff|jetable|disposable/i.test(blob)) score += 8;
    if (/kit|d[ée]but|debut/i.test(text) && /kit|starter|aio|pod/i.test(blob)) score += 5;
    if (p.isPromo) score += 1;
    if (p.isNew) score += 1;
    return { product: p, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit ?? 4)
    .map((s) => s.product);
}

/** Recherche élargie pour alternatives (score minimal plus bas / termes assouplis) */
export function searchCatalogAlternatives(
  products: CatalogProduct[],
  query: string,
  limit = 4
): CatalogProduct[] {
  const direct = searchCatalog(products, query, { limit });
  if (direct.length >= 2) return direct;

  const fallbackTerms = query
    .toLowerCase()
    .split(/[\s,;.!?]+/)
    .filter((t) => t.length > 3)
    .slice(0, 3)
    .join(" ");

  const broad = fallbackTerms
    ? searchCatalog(products, fallbackTerms, { limit })
    : [];

  const merged = [...direct];
  for (const p of broad) {
    if (!merged.some((x) => x.id === p.id)) merged.push(p);
  }

  if (merged.length > 0) return merged.slice(0, limit);

  // Dernier recours : bestsellers / promo en stock
  return products
    .filter(isAvailableForOffer)
    .sort((a, b) => Number(b.isBestSeller) - Number(a.isBestSeller) || Number(b.isPromo) - Number(a.isPromo))
    .slice(0, limit);
}

export function recommendForProfile(
  products: CatalogProduct[],
  profile: VapeProfileData,
  limit = 4
): CatalogProduct[] {
  return getPersonalizedRecommendations(products, profile, { limit }).map((r) => ({
    ...r.product,
    imageUrl: (r.product as CatalogProduct).imageUrl ?? null,
  }));
}
