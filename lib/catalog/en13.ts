/**
 * Politique EN13 / EAN-13 catalogue All Vap's.
 *
 * Règle obligatoire :
 * 1) Chercher une référence EN13 (barcode SumUp, fiche officielle, descriptif).
 * 2) Si trouvée et valide → l'intégrer (champ barcode + mention dans le descriptif).
 * 3) Si absente → NE PAS inventer (laisser null, pas de faux code dans le texte).
 */
export function isValidEan13(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const digits = raw.replace(/\D/g, "");
  if (!/^\d{13}$/.test(digits)) return false;
  const nums = digits.split("").map(Number);
  const sum = nums.slice(0, 12).reduce((acc, n, i) => acc + n * (i % 2 === 0 ? 1 : 3), 0);
  const check = (10 - (sum % 10)) % 10;
  return check === nums[12];
}

/** Extrait le premier EAN-13 valide d'un texte (descriptif, etc.). */
export function extractEan13FromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const matches = text.match(/\b(\d{13})\b/g) || [];
  for (const m of matches) {
    if (isValidEan13(m)) return m;
  }
  return null;
}

export type En13Source = "official" | "sumup" | "description" | "existing" | null;

/**
 * Résout l'EN13 à conserver — jamais inventé.
 * Priorité : officiel fabricant > déjà en DB (SumUp) > extrait du descriptif.
 */
export function resolveEn13(opts: {
  officialBarcode?: string | null;
  existingBarcode?: string | null;
  description?: string | null;
}): { barcode: string | null; source: En13Source } {
  const official = opts.officialBarcode?.replace(/\D/g, "") || null;
  if (official && isValidEan13(official)) {
    return { barcode: official, source: "official" };
  }

  const existing = opts.existingBarcode?.replace(/\D/g, "") || null;
  if (existing && isValidEan13(existing)) {
    return { barcode: existing, source: "existing" };
  }

  const fromDesc = extractEan13FromText(opts.description);
  if (fromDesc) {
    return { barcode: fromDesc, source: "description" };
  }

  return { barcode: null, source: null };
}

const EN13_LINE_RE = /\n?Code[- ]barres\s*\(EAN[- ]?13\)\s*:\s*\d{8,14}\s*/gi;

/** Ajoute ou met à jour la ligne EN13 dans le descriptif. N'ajoute rien si barcode null. */
export function upsertEn13InDescription(
  description: string | null | undefined,
  barcode: string | null
): string | null {
  const base = (description || "").replace(EN13_LINE_RE, "").trimEnd();
  if (!barcode) {
    return base || null;
  }
  if (!isValidEan13(barcode)) {
    return base || null;
  }
  const line = `Code-barres (EAN-13) : ${barcode}`;
  if (!base) return line;
  return `${base}\n\n${line}`;
}
