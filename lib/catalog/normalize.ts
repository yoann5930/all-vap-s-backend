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

/** Emplacement de stock officiel unique */
export const GLOBAL_STOCK_CODE = "GLOBAL_ALL_VAPS" as const;
export const GLOBAL_STOCK_NAME = "Stock général All Vap's";

export type StockLocationCode = typeof GLOBAL_STOCK_CODE;

export function isStockLocationCode(value: string): value is StockLocationCode {
  return value === GLOBAL_STOCK_CODE;
}

export const STOCK_LOCATION_SEED = [
  {
    code: GLOBAL_STOCK_CODE,
    name: GLOBAL_STOCK_NAME,
    address: null as string | null,
  },
];
