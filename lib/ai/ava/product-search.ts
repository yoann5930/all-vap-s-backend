import { AVA_SEARCH_CONFIG } from "./config";
import type {
  AvaCatalogProduct,
  AvaRankedProduct,
  AvaSearchCriteria,
  AvaVariantInfo,
} from "./types";
import { contradictionReasons } from "./contradiction-guard";

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function productBlob(p: AvaCatalogProduct): string {
  return norm(
    [
      p.name,
      p.description,
      p.shortDescription,
      p.brand,
      p.manufacturerName,
      p.category,
      p.range,
      p.primaryFlavor,
      p.secondaryFlavor,
      p.flavorFamily,
      p.flavors.join(" "),
      p.searchKeywords,
      p.avaKeywords,
      p.avaSaveurs,
      p.avaDescription,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function isInStock(p: AvaCatalogProduct): boolean {
  if (!AVA_SEARCH_CONFIG.onlyInStockProducts) return true;
  // Sans ligne StockLevel : le catalogue visibleOnline reste proposable
  if (!p.stockKnown) return true;
  if (p.variants.length > 0) {
    return (
      p.variants.some((v) => v.active && v.stock > 0) || p.availableQuantity > 0
    );
  }
  return p.availableQuantity > 0;
}

function pickVariant(
  p: AvaCatalogProduct,
  criteria: AvaSearchCriteria
): AvaVariantInfo | null {
  if (!p.variants.length) return null;
  let list = p.variants.filter((v) => v.active && v.stock > 0);
  if (!list.length && !p.stockKnown) {
    list = p.variants.filter((v) => v.active);
  }
  if (!list.length) list = p.variants.filter((v) => v.active);

  if (criteria.nicotineMg != null) {
    const match = list.filter(
      (v) =>
        v.nicotineMg != null &&
        Math.abs(v.nicotineMg - criteria.nicotineMg!) < 0.15
    );
    if (match.length) return match[0];
    return null;
  }
  if (criteria.volumeMl != null) {
    const match = list.filter(
      (v) =>
        v.capacityMl != null && Math.abs(v.capacityMl - criteria.volumeMl!) < 1
    );
    if (match.length) return match[0];
  }
  return list[0] ?? null;
}

function flavorMatchScore(p: AvaCatalogProduct, criteria: AvaSearchCriteria): number {
  let score = 0;
  const blob = productBlob(p);
  const family = criteria.flavorFamily;

  for (const term of criteria.flavorTerms) {
    const nt = norm(term);
    if (nt.length < 2) continue;
    if (blob.includes(nt)) score += 8;
    if (p.flavorValidated && blob.includes(nt)) score += 4;
  }

  if (family === "fruits_rouges") {
    if (
      /fruit.?rouge|fraise|framboise|cassis|myrtille|mure|cerise|berry|groseille/.test(
        blob
      )
    ) {
      score += 16;
    }
    if (p.isFruity === true) score += 4;
  }
  if (family === "gourmand") {
    if (p.isGourmet === true) score += 12;
    if (/gourmand|vanille|caramel|custard|biscuit|dessert|cookie|creme/.test(blob))
      score += 10;
  }
  if (family === "menthe" || family === "frais") {
    if (p.isMint === true || p.isFresh === true) score += 10;
    if (/menthe|menthol|mint|frais|ice|freeze|fresh/.test(blob)) score += 8;
  }
  if (family === "tabac") {
    if (p.isTobacco === true) score += 12;
    if (/tabac|classic|ry4|tobacco|blond/.test(blob)) score += 10;
  }
  if (family === "fruite") {
    if (p.isFruity === true) score += 10;
    if (/fruit/.test(blob)) score += 6;
  }
  if (family === "boisson") {
    if (p.isDrink === true) score += 10;
  }
  if (family === "agrumes" && /citron|orange|agrume|pamplemousse|lime/.test(blob)) {
    score += 12;
  }
  if (family === "exotique" && /mangue|ananas|passion|exotique|litchi|kiwi/.test(blob)) {
    score += 12;
  }

  return score;
}

function freshnessMatch(
  p: AvaCatalogProduct,
  criteria: AvaSearchCriteria
): { ok: boolean; score: number } {
  if (!criteria.freshness || criteria.freshness === "any") return { ok: true, score: 0 };
  const blob = productBlob(p);
  const coldToken =
    /\bfrais\b|\bfraicheur\b|\bice\b|\bfreeze\b|\bmenthol\b|\bfresh\b|\bcool\b|\bglace\b|\bglac[eé]\b/.test(
      blob
    );
  const markedFresh = p.isFresh === true || p.isMint === true || coldToken;
  const markedNotFresh = p.isFresh === false && !coldToken;

  if (criteria.freshness === "with") {
    if (markedFresh) return { ok: true, score: 8 };
    if (p.isFresh == null && !markedFresh) return { ok: true, score: -2 };
    return { ok: markedFresh, score: markedFresh ? 8 : -20 };
  }

  // without — ne pas confondre « fraise » avec « frais »
  if (markedFresh && !markedNotFresh) return { ok: false, score: -30 };
  if (p.isFresh === false || markedNotFresh) return { ok: true, score: 8 };
  return { ok: true, score: 0 };
}

function categoryMatch(p: AvaCatalogProduct, category: string | null | undefined): boolean {
  if (!category) return true;
  const c = norm(p.category);
  const needle = norm(category).replace(/-/g, "");
  if (category === "e-liquides") {
    // E-liquides ≠ concentrés DIY
    const typeBlob = `${norm(p.productType ?? "")} ${c} ${norm(p.name)} ${norm(p.range ?? "")}`;
    if (/concentre|concentrate|arome\b|diy\b/.test(typeBlob) && !/e-?liquid|pret\s*a\s*vaper|ready/.test(typeBlob)) {
      return false;
    }
    return /e-?liquid|liquide/.test(c) || /e-?liquid|liquide|nic.?salt|sel/.test(norm(p.productType ?? ""));
  }
  if (category === "diy") {
    const blob = `${c} ${norm(p.name)} ${norm(p.productType ?? "")} ${norm(p.range ?? "")}`;
    return /diy|arome|concentre|concentrate|base\b|booster/.test(blob);
  }
  if (category === "materiel") {
    return /pod|cigarette|box|mod|kit|aio/.test(c);
  }
  if (category === "resistances") return /resist|coil/.test(c);
  if (category === "puff") return /puff|jetable|dispos/.test(c + " " + norm(p.name));
  return c.includes(needle) || needle.includes(c.replace(/-/g, ""));
}

/**
 * Recherche et classement produits pour A.V.A. — source unique.
 */
export function searchProductsForAva(
  products: AvaCatalogProduct[],
  criteria: AvaSearchCriteria,
  options: { limit?: number; excludeIds?: string[] } = {}
): AvaRankedProduct[] {
  const limit = options.limit ?? AVA_SEARCH_CONFIG.maxProductResults;
  const exclude = new Set(options.excludeIds ?? []);
  const q = norm(criteria.rawQuery);

  const ranked: AvaRankedProduct[] = [];

  for (const p of products) {
    if (exclude.has(p.id)) continue;
    if (!p.isActive || !p.visibleOnline) continue;
    // Exclusion définitive Puff / JNR / jetables (hors suggestions A.V.A.)
    const excludeBlob =
      `${p.name} ${p.brand ?? ""} ${p.category} ${p.productType ?? ""} ${p.description ?? ""}`.toLowerCase();
    if (/\bpuff\b|\bjnr\b|jetable|disposables?/.test(excludeBlob)) continue;
    if (!categoryMatch(p, criteria.category)) continue;

    if (criteria.promoOnly && !p.isPromo) continue;
    if (criteria.newOnly && !p.isNew) continue;

    if (criteria.manufacturer) {
      const m = norm(criteria.manufacturer);
      const blob = `${norm(p.brand ?? "")} ${norm(p.manufacturerName ?? "")} ${norm(p.name)}`;
      if (!blob.includes(m)) continue;
    }

    if (criteria.range) {
      const rg = norm(criteria.range);
      const rangeBlob = `${norm(p.range ?? "")} ${norm(p.name)}`;
      if (!rangeBlob.includes(rg)) continue;
    }

    if (criteria.volumeMl != null) {
      const volOk =
        (p.volumeMl != null && Math.abs(p.volumeMl - criteria.volumeMl) < 1) ||
        p.variants.some(
          (v) => v.capacityMl != null && Math.abs(v.capacityMl - criteria.volumeMl!) < 1
        ) ||
        norm(p.name).includes(`${criteria.volumeMl} ml`) ||
        norm(p.name).includes(`${criteria.volumeMl}ml`);
      if (!volOk) continue;
    }

    const fresh = freshnessMatch(p, criteria);
    if (!fresh.ok) continue;

    // Garde contradictions (volume / fabricant / frais / type)
    if (contradictionReasons(criteria, p).length > 0) continue;

    let score = flavorMatchScore(p, criteria) + fresh.score;

    // Nicotine variante
    let matchedVariant = pickVariant(p, criteria);
    if (criteria.nicotineMg != null) {
      if (!matchedVariant || matchedVariant.stock <= 0) {
        // Produit existe mais variante nicotine absente / rupture
        const anyNic = p.variants.find(
          (v) =>
            v.nicotineMg != null &&
            Math.abs(v.nicotineMg - criteria.nicotineMg!) < 0.15
        );
        if (anyNic && anyNic.stock <= 0) {
          ranked.push({
            product: p,
            score: score + 5,
            matchedVariant: anyNic,
            reason: "rupture variante",
            needsVerification: AVA_SEARCH_CONFIG.verifyStatuses.includes(p.catalogStatus),
            outOfStockExact: true,
          });
        }
        continue;
      }
      score += 10;
    }

    // Termes libres
    const blob = productBlob(p);
    const terms = q
      .split(/[\s,;.!?]+/)
      .filter(
        (t) =>
          t.length > 2 &&
          ![
            "cherche",
            "veux",
            "voudrais",
            "avec",
            "sans",
            "dans",
            "liquide",
            "eliquide",
            "pour",
            "une",
            "des",
          ].includes(t)
      )
      .slice(0, 12);

    for (const term of terms) {
      if (blob.includes(term)) score += 3;
      if (norm(p.name).includes(term)) score += 2;
    }

    if (!isInStock(p) && !matchedVariant) {
      if (score > 8 || criteria.flavorFamily || criteria.category) {
        ranked.push({
          product: p,
          score,
          matchedVariant: null,
          reason: "rupture",
          needsVerification: AVA_SEARCH_CONFIG.verifyStatuses.includes(p.catalogStatus),
          outOfStockExact: true,
        });
      }
      continue;
    }

    if (AVA_SEARCH_CONFIG.onlyInStockProducts && p.stockKnown && !isInStock(p)) {
      if (score > 8 || criteria.flavorFamily || criteria.category) {
        ranked.push({
          product: p,
          score,
          matchedVariant: matchedVariant ?? pickVariant(p, { ...criteria, nicotineMg: null }),
          reason: "rupture",
          needsVerification: AVA_SEARCH_CONFIG.verifyStatuses.includes(p.catalogStatus),
          outOfStockExact: true,
        });
      }
      continue;
    }
    // Variante choisie doit être commandable quand le stock inventaire est connu
    if (AVA_SEARCH_CONFIG.onlyInStockProducts && p.stockKnown) {
      if (!matchedVariant || matchedVariant.stock <= 0) {
        matchedVariant = pickVariant(p, { ...criteria, nicotineMg: null });
      }
      if (p.variants.length > 0 && (!matchedVariant || matchedVariant.stock <= 0)) {
        if (score > 8 || criteria.flavorFamily || criteria.category) {
          ranked.push({
            product: p,
            score,
            matchedVariant: matchedVariant,
            reason: "rupture",
            needsVerification: AVA_SEARCH_CONFIG.verifyStatuses.includes(p.catalogStatus),
            outOfStockExact: true,
          });
        }
        continue;
      }
    } else if (!matchedVariant && p.variants.length > 0) {
      matchedVariant = pickVariant(p, { ...criteria, nicotineMg: null });
    }
    if (
      p.stockKnown &&
      matchedVariant &&
      matchedVariant.stock <= 0 &&
      criteria.nicotineMg != null
    ) {
      continue;
    }

    if (score <= 0 && !criteria.flavorFamily && !criteria.category) continue;
    if (score <= 0 && criteria.flavorFamily) continue;

    ranked.push({
      product: p,
      score,
      matchedVariant,
      reason: criteria.flavorFamily || criteria.category || "catalogue",
      needsVerification: AVA_SEARCH_CONFIG.verifyStatuses.includes(p.catalogStatus),
      outOfStockExact: false,
    });
  }

  const sorted = ranked.sort((a, b) => b.score - a.score);
  const inStock = sorted.filter((r) => !r.outOfStockExact);
  if (inStock.length > 0) return inStock.slice(0, limit);
  // Fallback : aligné sur /api/search (catalogue visibleOnline même si StockLevel à 0)
  return sorted.slice(0, limit);
}

export function searchInStockProducts(
  products: AvaCatalogProduct[],
  criteria: AvaSearchCriteria,
  limit = AVA_SEARCH_CONFIG.maxProductResults
): AvaRankedProduct[] {
  return searchProductsForAva(products, criteria, { limit });
}

export function rankProductsForCustomerRequest(
  products: AvaCatalogProduct[],
  criteria: AvaSearchCriteria
): AvaRankedProduct[] {
  return searchProductsForAva(products, criteria);
}

export function getProductDetailsForAva(
  products: AvaCatalogProduct[],
  idOrSlug: string
): AvaCatalogProduct | null {
  const q = idOrSlug.toLowerCase();
  return products.find((p) => p.id === q || p.slug === q) ?? null;
}

/** Alternatives proches si 0 résultat exact en stock */
export function searchNearbyAlternatives(
  products: AvaCatalogProduct[],
  criteria: AvaSearchCriteria,
  limit = AVA_SEARCH_CONFIG.maxProductResults
): AvaRankedProduct[] {
  const relaxed: AvaSearchCriteria = {
    ...criteria,
    nicotineMg: null,
    volumeMl: criteria.volumeMl,
    freshness: criteria.freshness === "without" ? "without" : null,
  };
  const alt = searchProductsForAva(products, relaxed, { limit });
  if (alt.length) return alt;

  // Ne jamais abandonner « pas trop frais » → sinon Ice Cool revient en silence
  const looser: AvaSearchCriteria = {
    ...criteria,
    nicotineMg: null,
    volumeMl: null,
    freshness: criteria.freshness === "without" ? "without" : null,
    flavorTerms: criteria.flavorTerms.slice(0, 2),
  };
  return searchProductsForAva(products, looser, { limit });
}
