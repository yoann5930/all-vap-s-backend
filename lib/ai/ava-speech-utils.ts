/** Texte oral court — naturellement parlé, pas « robot call-center » */

export const AVA_GREETING_SHORT =
  "Bonjour, je m'appelle Ava. Que recherchez-vous ?";

/** Prépare le texte pour une lecture fluide et humaine */
export function humanizeForSpeech(text: string): string {
  return text
    .replace(/👋/g, "")
    .replace(/A\.V\.A\./gi, "Ava")
    .replace(/\bA\s*[-.]?\s*V\s*[-.]?\s*A\b/gi, "Ava")
    .replace(/\bAVA\b/g, "Ava")
    .replace(/All Vap['’]?s/gi, "All Vaps")
    .replace(/e-liquides?/gi, "é liquides")
    .replace(/E-liquides?/g, "é liquides")
    // DIY se prononce « Di-Yaï », jamais lettre à lettre
    .replace(/\bDIY\b/gi, "Di-Yaï")
    .replace(/D I Y/gi, "Di-Yaï")
    .replace(/\bSAV\b/g, "service après-vente")
    .replace(/\bMTL\b/g, "tirage serré")
    .replace(/\bDL\b/g, "tirage aérien")
    .replace(/Les recommandations All Vap'?s sont indicatives[^.]*\./gi, "")
    .replace(/La vape ne soigne ni ne guérit\./gi, "")
    .replace(/Réservé aux \+?18 ans\./gi, "")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s*\/\s*/g, " ou ")
    .replace(/\.{3,}/g, "…")
    .replace(/\s*\n+\s*/g, ". ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;!?…])/g, "$1")
    .trim();
}

export function toSpokenText(text: string, maxLen = 220): string {
  const clean = humanizeForSpeech(text);
  if (clean.length <= maxLen) return clean;

  const cut = clean.slice(0, maxLen);
  const lastStop = Math.max(
    cut.lastIndexOf("."),
    cut.lastIndexOf("!"),
    cut.lastIndexOf("?"),
    cut.lastIndexOf("…")
  );
  if (lastStop > 60) return cut.slice(0, lastStop + 1).trim();
  const lastComma = cut.lastIndexOf(",");
  if (lastComma > 60) return `${cut.slice(0, lastComma).trim()}.`;
  return `${cut.trim()}…`;
}

export function toSubtitle(text: string, maxLen = 100): string {
  const line = text.split("\n").find((l) => l.trim().length > 0) ?? text;
  const clean = line.replace(/👋/g, "").trim();
  return clean.length > maxLen ? `${clean.slice(0, maxLen)}…` : clean;
}

/** Découpe en phrases pour un rythme oral plus naturel (TTS navigateur) */
export function splitSpokenSentences(text: string): string[] {
  const clean = humanizeForSpeech(text);
  const parts = clean.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) ?? [clean];
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/** Extrait nicotine / PG-VG / contenance depuis le texte catalogue (si présents). */
export function parseCatalogSpecs(description: string | null | undefined): {
  nicotine: string | null;
  pgVg: string | null;
  volume: string | null;
} {
  if (!description) return { nicotine: null, pgVg: null, volume: null };
  const d = description;

  const nic =
    d.match(/(\d+(?:[.,]\d+)?)\s*mg(?:\/ml)?/i)?.[0] ??
    d.match(/nicotine\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*mg/i)?.[0] ??
    null;

  const pgVg =
    d.match(/\b(\d{1,2})\s*[\/:]\s*(\d{1,2})\b/)?.[0]?.replace(":", "/") ??
    d.match(/PG\s*[\/:]\s*VG\s*[:=]?\s*(\d{1,2}\s*[\/:]\s*\d{1,2})/i)?.[1]?.replace(":", "/") ??
    null;

  const volume =
    d.match(/\b(\d+(?:[.,]\d+)?)\s*ml\b/i)?.[0] ??
    d.match(/contenance\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*ml/i)?.[0] ??
    null;

  return {
    nicotine: nic ? nic.replace(",", ".") : null,
    pgVg,
    volume: volume ? volume.replace(",", ".") : null,
  };
}
