import type { AvaCatalogProduct, AvaProductCardDto, AvaRankedProduct, AvaSearchCriteria } from "./types";
import { AVA_SEARCH_CONFIG } from "./config";
import { commercialProductName } from "@/lib/ai/ava-voice-product-rules";

function flavorLabel(p: AvaCatalogProduct): string | null {
  if (p.avaSaveurs?.trim()) return p.avaSaveurs.trim();
  const bits = [p.primaryFlavor, p.secondaryFlavor, ...p.flavors].filter(Boolean);
  if (bits.length) return bits.slice(0, 3).join(", ");
  return null;
}

export function toAvaProductCard(
  ranked: AvaRankedProduct,
  reason: string
): AvaProductCardDto {
  const p = ranked.product;
  const v = ranked.matchedVariant;
  const stock = v ? v.stock : p.availableQuantity;
  const priceCents =
    v?.priceCents != null && v.priceCents > 0 ? v.priceCents : p.priceCents;

  // Carte écran : prix / stock / volume restent VISUELS — pas pour la voix
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    imageUrl: p.imageUrl,
    priceCents,
    promoPriceCents: p.promoPriceCents ?? null,
    isPromo: Boolean(p.isPromo),
    stock,
    description: p.shortDescription || p.description,
    reason,
    nicotine:
      v?.nicotineLabel ||
      (v?.nicotineMg != null ? `${v.nicotineMg} mg` : null),
    pgVg: v?.pgVgLabel ?? null,
    volume:
      p.volumeMl != null
        ? `${p.volumeMl} ml`
        : v?.capacityMl != null
          ? `${v.capacityMl} ml`
          : null,
    variantId: v?.id ?? null,
  };
}

const INTROS_MULTI = [
  "Avec plaisir. J'ai trouvé plusieurs références correspondant à votre recherche.",
  "Je viens de trouver plusieurs produits susceptibles de vous intéresser.",
  "Parfait. J'ai plusieurs références qui pourraient vous convenir.",
];

const INTROS_SINGLE = [
  "J'ai trouvé le produit que vous recherchez. Je vous affiche sa fiche juste en dessous.",
  "Voici la référence demandée. Je vous l'affiche juste en dessous.",
];

const INTROS_ALT = [
  "Je n'ai pas l'exacte référence, mais voici des options proches à découvrir juste en dessous.",
  "Pas de correspondance exacte, en revanche voici des alternatives affichées à l'écran.",
];

const SCREEN_HINTS = [
  "Je vous laisse les découvrir juste en dessous. Les informations détaillées et les tarifs sont directement affichés à l'écran.",
  "Vous retrouverez le tarif et les détails directement sur votre écran. Vous pouvez ouvrir la fiche produit si vous souhaitez davantage d'informations.",
  "Les prix sont affichés juste en dessous des produits. Si vous souhaitez des précisions sur l'une d'elles, je peux également vous conseiller.",
];

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

function spokenNames(list: AvaRankedProduct[]): string[] {
  const names = list.map((r) => commercialProductName(r.product.name)).filter(Boolean);
  return [...new Set(names)];
}

/**
 * Réponse orale naturelle — conseillère, jamais lecture de fiche catalogue.
 * Règles : pas de prix, stock, volume, fabricant, gamme — noms commerciaux seulement.
 */
export function buildAvaProductAnswer(
  ranked: AvaRankedProduct[],
  criteria: AvaSearchCriteria,
  options: { alternatives?: boolean } = {}
): { content: string; products: AvaProductCardDto[]; suggestions: string[] } {
  // Priorité : en stock inventaire. Sinon catalogue visibleOnline (aligné /api/search).
  let list = ranked
    .filter((r) => !r.outOfStockExact)
    .filter((r) => {
      if (!r.product.stockKnown) return true;
      const stock = r.matchedVariant
        ? r.matchedVariant.stock
        : r.product.availableQuantity;
      return stock > 0;
    })
    .slice(0, AVA_SEARCH_CONFIG.maxProductResults);

  if (list.length === 0 && ranked.length > 0) {
    list = ranked.slice(0, AVA_SEARCH_CONFIG.maxProductResults);
  }

  const products = list.map((r) =>
    toAvaProductCard(r, options.alternatives ? "alternatives" : r.reason)
  );

  if (list.length === 0) {
    return {
      content:
        "Je ne trouve pas de produit disponible pour cette demande pour le moment. On peut élargir : autre saveur, format, ou sans fraîcheur ?",
      products: [],
      suggestions: ["Fruité", "Gourmand", "Menthe", "Promotions"],
    };
  }

  const seed =
    list[0].product.id.length +
    (criteria.flavorFamily?.length ?? 0) +
    (criteria.freshness?.length ?? 0) +
    list.length;

  const names = spokenNames(list);
  const parts: string[] = [];

  if (options.alternatives) {
    parts.push(pick(INTROS_ALT, seed));
    if (names.length === 1) {
      parts.push(`Par exemple ${names[0]}.`);
    } else if (names.length === 2) {
      parts.push(`Par exemple ${names[0]} et ${names[1]}.`);
    } else {
      parts.push(`Par exemple ${names.slice(0, 3).join(", ")}.`);
    }
    parts.push(pick(SCREEN_HINTS, seed + 1));
  } else if (names.length === 1) {
    parts.push(pick(INTROS_SINGLE, seed));
  } else {
    parts.push(pick(INTROS_MULTI, seed));
    if (names.length === 2) {
      parts.push(`Par exemple ${names[0]} et ${names[1]}.`);
    } else {
      parts.push(`Par exemple ${names.slice(0, 3).join(", ")}.`);
    }
    parts.push(pick(SCREEN_HINTS, seed + 2));
  }

  if (criteria.freshness == null && criteria.flavorFamily === "fruits_rouges") {
    parts.push("Si vous préférez plus ou moins de fraîcheur, dites-le-moi.");
  }

  return {
    content: parts.join(" "),
    products,
    suggestions: names.slice(0, 3),
  };
}

export function buildOutOfStockAnswer(productName: string): string {
  const short = commercialProductName(productName) || productName;
  return `« ${short} » figure bien dans notre catalogue, mais n'est pas disponible pour le moment. Je peux vous proposer une alternative affichée à l'écran si vous voulez.`;
}

export function buildClarificationAnswer(question: string): {
  content: string;
  products: AvaProductCardDto[];
  suggestions: string[];
} {
  return {
    content: question,
    products: [],
    suggestions: ["Fruité", "Gourmand", "Avec fraîcheur", "Sans fraîcheur"],
  };
}

export { commercialProductName, flavorLabel };
