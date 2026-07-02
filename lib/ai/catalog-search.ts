import type { ProductForScoring } from "@/lib/recommendations/engine";
import { getPersonalizedRecommendations } from "@/lib/recommendations/engine";
import type { VapeProfileData } from "@/lib/vape-profile/types";

export interface CatalogProduct extends ProductForScoring {
  imageUrl: string | null;
}

const CATEGORY_ALIASES: Record<string, string[]> = {
  "e-liquides": ["liquide", "e-liquid", "eliquide", "juice", "saveur"],
  pods: ["pod", "cartouche"],
  "cigarettes-electroniques": ["cigarette", "kit", "aio", "starter", "début", "debut"],
  resistances: ["résistance", "resistance", "coil", "mesh"],
  accu: ["accu", "batterie", "18650", "21700"],
  chargeurs: ["chargeur", "charger"],
  diy: ["diy", "base", "arôme", "arome", "nicotine"],
  accessoires: ["accessoire", "drip tip", "coton"],
  box: ["box", "mod"],
  clearomiseurs: ["clearo", "atomiseur", "tank"],
};

export function searchCatalog(
  products: CatalogProduct[],
  query: string,
  options: { category?: string; limit?: number; promoOnly?: boolean; newOnly?: boolean } = {}
): CatalogProduct[] {
  const text = query.toLowerCase();
  let pool = products.filter((p) => p.stock > 0);

  if (options.promoOnly) pool = pool.filter((p) => p.isPromo);
  if (options.newOnly) pool = pool.filter((p) => p.isNew);

  if (options.category) {
    const cat = options.category.toLowerCase();
    pool = pool.filter((p) => p.category.toLowerCase().includes(cat));
  }

  for (const [cat, aliases] of Object.entries(CATEGORY_ALIASES)) {
    if (aliases.some((a) => text.includes(a))) {
      const inCat = products.filter(
        (p) => p.stock > 0 && p.category.toLowerCase().includes(cat.replace(/-/g, "")) || p.category === cat
      );
      if (inCat.length > 0) pool = inCat;
      break;
    }
  }

  const terms = text
    .split(/[\s,;.!?]+/)
    .filter((t) => t.length > 2)
    .slice(0, 8);

  const scored = pool.map((p) => {
    const blob = `${p.name} ${p.description ?? ""} ${p.brand ?? ""} ${p.category}`.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (blob.includes(term)) score += 2;
    }
    if (/fruit/i.test(text) && /fruit|berry|mangue|ananas|cerise/i.test(blob)) score += 5;
    if (/frais|menthol/i.test(text) && /frais|menthe|ice|heisenberg/i.test(blob)) score += 5;
    if (/gourmand/i.test(text) && /gourmand|vanille|caramel|tarte/i.test(blob)) score += 5;
    if (/classic|tabac/i.test(text) && /classic|tabac|ry4/i.test(blob)) score += 5;
    if (/résistance|resistance|coil/i.test(text) && /résistance|resistance|coil|mesh/i.test(blob)) score += 6;
    if (/pod/i.test(text) && /pod/i.test(blob)) score += 4;
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
