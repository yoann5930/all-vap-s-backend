/** Short spoken/subtitle lines — no long chat blocks */
export const AVA_GREETING_SHORT =
  "Bonjour, je suis A.V.A., votre conseillère All Vap's. Comment puis-je vous aider ?";

export function toSpokenText(text: string, maxLen = 280): string {
  const clean = text
    .replace(/👋/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const cut = clean.slice(0, maxLen);
  const lastPeriod = cut.lastIndexOf(".");
  if (lastPeriod > 80) return cut.slice(0, lastPeriod + 1);
  return cut;
}

export function toSubtitle(text: string, maxLen = 100): string {
  const line = text.split("\n").find((l) => l.trim().length > 0) ?? text;
  const clean = line.replace(/👋/g, "").trim();
  return clean.length > maxLen ? `${clean.slice(0, maxLen)}…` : clean;
}
