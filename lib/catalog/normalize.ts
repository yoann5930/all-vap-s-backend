/**
 * Normalisation des noms produits — matching uniquement.
 * Ne jamais remplacer le nom officiel affiché au client.
 */

export function stripAccents(input: string): string {
  return input.normalize("NFD").replace(/\p{M}/gu, "");
}

export function normalizeProductName(raw: string): string {
  return stripAccents(raw)
    .toLowerCase()
    .replace(/[''`´]/g, "'")
    .replace(/[^\w\s./+\-']/g, " ")
    .replace(/\b(\d+)\s*m\.?l\.?\b/gi, "$1ml")
    .replace(/\b(\d+[.,]?\d*)\s*mg(?:\/ml)?\b/gi, "$1mg")
    .replace(/\b(\d+[.,]?\d*)\s*ohm(?:s)?\b/gi, "$1ohm")
    .replace(/\b(\d+[.,]?\d*)\s*w(?:att)?s?\b/gi, "$1w")
    .replace(/\s*[-–—/|]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extrait des attributs UNIQUEMENT s'ils sont explicitement présents dans le texte. */
export function extractExplicitSpecs(raw: string): {
  nicotineMg: number | null;
  capacityMl: number | null;
  resistanceOhms: number | null;
  powerWatts: number | null;
} {
  const text = raw;
  const nic = text.match(/(\d+(?:[.,]\d+)?)\s*mg(?:\/ml)?/i);
  const ml = text.match(/(\d+(?:[.,]\d+)?)\s*ml\b/i);
  const ohm = text.match(/(\d+(?:[.,]\d+)?)\s*(?:ohm|Ω)/i);
  const watt = text.match(/(\d+(?:[.,]\d+)?)\s*w(?:att)?s?\b/i);

  const toNum = (m: RegExpMatchArray | null) =>
    m ? parseFloat(m[1].replace(",", ".")) : null;

  return {
    nicotineMg: toNum(nic),
    capacityMl: toNum(ml),
    resistanceOhms: toNum(ohm),
    powerWatts: toNum(watt),
  };
}

/** Legacy — inactif, plus d'écriture. Conservé pour migration / historique. */
export const GLOBAL_STOCK_CODE = "GLOBAL_ALL_VAPS" as const;
export const GLOBAL_STOCK_NAME = "Stock général All Vap's (legacy)";

/** Emplacements boutiques — seules sources écritables */
export const HAUTMONT_STOCK_CODE = "HAUTMONT" as const;
export const LE_QUESNOY_STOCK_CODE = "LE_QUESNOY" as const;

export const HAUTMONT_STOCK_NAME = "All Vap's Hautmont";
export const LE_QUESNOY_STOCK_NAME = "All Vap's Le Quesnoy";

export const STORE_STOCK_CODES = [HAUTMONT_STOCK_CODE, LE_QUESNOY_STOCK_CODE] as const;
export type StoreStockCode = (typeof STORE_STOCK_CODES)[number];
export type StockLocationCode = StoreStockCode;

export function isStoreStockCode(value: string): value is StoreStockCode {
  return value === HAUTMONT_STOCK_CODE || value === LE_QUESNOY_STOCK_CODE;
}

/** @deprecated utiliser isStoreStockCode */
export function isStockLocationCode(value: string): value is StockLocationCode {
  return isStoreStockCode(value);
}

export function storeIdToStockCode(storeId: string | null | undefined): StoreStockCode {
  if (storeId === "le-quesnoy") return LE_QUESNOY_STOCK_CODE;
  // Défaut documenté : click&collect / livraisons sans boutique → Hautmont
  return HAUTMONT_STOCK_CODE;
}

export function stockCodeToStoreId(code: StoreStockCode): "hautmont" | "le-quesnoy" {
  return code === LE_QUESNOY_STOCK_CODE ? "le-quesnoy" : "hautmont";
}

export function stockCodeDisplayName(code: StoreStockCode): string {
  return code === LE_QUESNOY_STOCK_CODE ? LE_QUESNOY_STOCK_NAME : HAUTMONT_STOCK_NAME;
}

export const STOCK_LOCATION_SEED = [
  {
    code: HAUTMONT_STOCK_CODE,
    name: HAUTMONT_STOCK_NAME,
    address: "17 Avenue Marcel Aimé, 59330 Hautmont" as string | null,
  },
  {
    code: LE_QUESNOY_STOCK_CODE,
    name: LE_QUESNOY_STOCK_NAME,
    address: "10 Rue Léon Gambetta, 59530 Le Quesnoy" as string | null,
  },
];
