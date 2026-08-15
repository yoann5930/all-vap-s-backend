/**
 * Détection d'intention stock (sans Prisma) — ne pas confondre avec une recherche produit.
 */
import { normalizeLoose } from "@/lib/ava/normalize-loose";
import type { SpeechIntent } from "@/lib/ava/speech/types";
import type { PreferredStoreId } from "@/lib/stores/preferred-store";

export type AvaStockIntent =
  | "STOCK_SUMMARY"
  | "STOCK_BY_STORE"
  | "STOCK_OUT_OF_STOCK_COUNT"
  | "STOCK_AVAILABLE_COUNT"
  | "PRODUCT_STOCK_DETAIL";

export type DetectedStockQuestion = {
  intent: AvaStockIntent;
  storeHint: PreferredStoreId | null;
  productHint: string | null;
};

const SPECIFIC_FLAVOR =
  /\b(menthe|menthol|mint|fraise|strawberry|framboise|cassis|vanille|caramel|tabac|classic|chlorophylle)\b/i;

const GENERIC_COUNT_TARGET =
  /\b(produits?|articles?|references?|r[eé]f[eé]rences?)\b/i;

const STOCK_CUE =
  /\b(stock|rupture|disponibles?|available|in stock|out of stock)\b/i;

const COUNT_CUE =
  /\b(combien|how many|how much|etat du stock|etat de stock|resume du stock|niveau stock|ca donne quoi|y en a|il y en a)\b/i;

function hasSpecificFlavor(loose: string): boolean {
  return SPECIFIC_FLAVOR.test(loose);
}

function storeHintFrom(loose: string, lastStore?: PreferredStoreId | null): PreferredStoreId | null {
  if (/\bquesnoy\b/.test(loose)) return "le-quesnoy";
  if (/\bhautmont\b/.test(loose)) return "hautmont";
  return lastStore ?? null;
}

function namedProductAfterReste(original: string): string | null {
  const m = original.match(
    /(?:combien\s+(?:il\s+)?reste(?:\s+il)?|il\s+reste\s+combien|reste\s+combien)\s+(?:de\s+(?:la\s+|l['’]|du\s+)?)(.+)/i,
  );
  if (!m) return null;
  const name = m[1].replace(/[?.!]+$/g, "").trim();
  const loose = normalizeLoose(name);
  if (!name || /^(produits?|articles?|references?|stock)$/i.test(loose)) return null;
  return name;
}

/**
 * Distingue question globale de stock vs recherche d'un produit.
 * Le mot « produit » seul ne déclenche PAS une recherche catalogue.
 */
export function detectAvaStockQuestion(
  raw: string,
  opts: {
    lastTopic?: string | null;
    lastStoreHint?: PreferredStoreId | null;
    lastProposedNames?: string[];
  } = {},
): DetectedStockQuestion | null {
  const original = (raw || "").trim();
  if (!original) return null;
  const loose = normalizeLoose(original);
  const lastStore = opts.lastStoreHint ?? null;
  const stockFollowUp = opts.lastTopic === "stock";

  if (stockFollowUp) {
    if (/^(et )?(au |a |à )?(le )?quesnoy/.test(loose) || /\bquesnoy\b/.test(loose)) {
      return { intent: "STOCK_BY_STORE", storeHint: "le-quesnoy", productHint: null };
    }
    if (/^(et )?(a |à |au )?hautmont/.test(loose) || /\bhautmont\b/.test(loose)) {
      return { intent: "STOCK_BY_STORE", storeHint: "hautmont", productHint: null };
    }
    if (/\b(total|tous|ensemble|les deux)\b/.test(loose)) {
      return { intent: "STOCK_SUMMARY", storeHint: null, productHint: null };
    }
    if (/\brupture\b/.test(loose)) {
      return { intent: "STOCK_OUT_OF_STOCK_COUNT", storeHint: storeHintFrom(loose, lastStore), productHint: null };
    }
    if (COUNT_CUE.test(loose) || /^(et )?(au )?total/.test(loose)) {
      return lastStore && !/\btotal\b/.test(loose)
        ? { intent: "STOCK_BY_STORE", storeHint: lastStore, productHint: null }
        : { intent: "STOCK_SUMMARY", storeHint: null, productHint: null };
    }
  }

  if (/\bce produit est en stock\b/.test(loose) || (/\bce produit\b/.test(loose) && /\bstock\b/.test(loose))) {
    const fromCtx = opts.lastProposedNames?.[0] ?? null;
    return { intent: "PRODUCT_STOCK_DETAIL", storeHint: storeHintFrom(loose, lastStore), productHint: fromCtx };
  }

  const named = namedProductAfterReste(original);
  if (named) {
    return { intent: "PRODUCT_STOCK_DETAIL", storeHint: storeHintFrom(loose, lastStore), productHint: named };
  }

  const haveAsk = /\b(vous avez|tu as|t as|avez vous|as tu|do you have)\b/.test(loose);
  if (haveAsk && hasSpecificFlavor(loose) && !GENERIC_COUNT_TARGET.test(loose)) {
    return null;
  }
  if (hasSpecificFlavor(loose) && !GENERIC_COUNT_TARGET.test(loose) && !/\bcombien de produits\b/.test(loose)) {
    if (/\b(stock|reste)\b/.test(loose)) {
      const flavor = loose.match(SPECIFIC_FLAVOR)?.[0] ?? null;
      return { intent: "PRODUCT_STOCK_DETAIL", storeHint: storeHintFrom(loose, lastStore), productHint: flavor };
    }
    return null;
  }

  const globalCount =
    COUNT_CUE.test(loose) &&
    (GENERIC_COUNT_TARGET.test(loose) || STOCK_CUE.test(loose) || /\bhow many products\b/.test(loose));

  const etatStock =
    /\b(etat|resume|synthese|niveau)\b/.test(loose) && /\bstock\b/.test(loose);
  const howManyEn =
    /\bhow many products\b/.test(loose) || /\bhow much stock\b/.test(loose);
  const stockTotal =
    /\bstock total\b/.test(loose) ||
    /\bnotre stock\b/.test(loose) ||
    /\bquel est .{0,20}stock\b/.test(loose);

  if (!globalCount && !etatStock && !howManyEn && !stockTotal && !/\brupture\b/.test(loose)) {
    return null;
  }

  const store = storeHintFrom(loose, stockFollowUp ? lastStore : null);
  if (/\brupture\b/.test(loose)) {
    return { intent: "STOCK_OUT_OF_STOCK_COUNT", storeHint: store, productHint: null };
  }
  if (/\bdisponibles?\b/.test(loose) && GENERIC_COUNT_TARGET.test(loose) && !/\ben stock\b/.test(loose)) {
    return { intent: "STOCK_AVAILABLE_COUNT", storeHint: store, productHint: null };
  }
  if (store && (globalCount || etatStock || howManyEn || stockTotal)) {
    return { intent: "STOCK_BY_STORE", storeHint: store, productHint: null };
  }
  if (globalCount || etatStock || howManyEn || stockTotal) {
    return { intent: "STOCK_SUMMARY", storeHint: null, productHint: null };
  }
  return null;
}

export function isAvaStockIntent(intent: SpeechIntent | AvaStockIntent): intent is AvaStockIntent {
  return (
    intent === "STOCK_SUMMARY" ||
    intent === "STOCK_BY_STORE" ||
    intent === "STOCK_OUT_OF_STOCK_COUNT" ||
    intent === "STOCK_AVAILABLE_COUNT" ||
    intent === "PRODUCT_STOCK_DETAIL"
  );
}
