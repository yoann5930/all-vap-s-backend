/** Texte oral court — naturellement parlé, pas « robot call-center » */

export const AVA_GREETING_SHORT =
  "Bonjour, je suis Ava, votre conseillère All Vaps. Comment puis-je vous aider ?";

/** Prépare le texte pour une lecture fluide et humaine */
export function humanizeForSpeech(text: string): string {
  return text
    .replace(/👋/g, "")
    .replace(/A\.V\.A\./gi, "Ava")
    .replace(/\bAVA\b/g, "Ava")
    .replace(/All Vap['’]?s/gi, "All Vaps")
    .replace(/e-liquides?/gi, "é liquides")
    .replace(/E-liquides?/g, "é liquides")
    .replace(/DIY/g, "D I Y")
    .replace(/SAV/g, "service après-vente")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s*\/\s*/g, " ou ")
    .replace(/\.{3,}/g, "…")
    .replace(/\s*\n+\s*/g, ". ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;!?…])/g, "$1")
    .trim();
}

export function toSpokenText(text: string, maxLen = 320): string {
  const clean = humanizeForSpeech(text);
  if (clean.length <= maxLen) return clean;

  const cut = clean.slice(0, maxLen);
  const lastStop = Math.max(
    cut.lastIndexOf("."),
    cut.lastIndexOf("!"),
    cut.lastIndexOf("?"),
    cut.lastIndexOf("…")
  );
  if (lastStop > 90) return cut.slice(0, lastStop + 1).trim();
  const lastComma = cut.lastIndexOf(",");
  if (lastComma > 90) return `${cut.slice(0, lastComma).trim()}.`;
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
