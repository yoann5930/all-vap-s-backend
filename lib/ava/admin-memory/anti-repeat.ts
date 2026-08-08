/**
 * Empreinte simple + détection de réponses trop similaires.
 */

function fingerprint(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9àâäéèêëïîôùûüç\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}

function tokens(s: string): Set<string> {
  return new Set(
    fingerprint(s)
      .split(" ")
      .filter((t) => t.length > 3)
  );
}

export function replySimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / Math.max(ta.size, tb.size);
}

export function isTooSimilarToRecent(
  candidate: string,
  recentFingerprintsOrTexts: string[],
  threshold = 0.72
): boolean {
  for (const prev of recentFingerprintsOrTexts) {
    if (replySimilarity(candidate, prev) >= threshold) return true;
  }
  return false;
}

export function makeReplyFingerprint(text: string): string {
  return fingerprint(text);
}

/**
 * Si trop similaire : forcer une version plus courte / directe.
 */
export function dampenRepetition(text: string, preferShort: boolean): string {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  // Coupe les accroches robotiques
  const cleaned = lines.filter(
    (l) =>
      !/je comprends (votre|ta) demande/i.test(l) &&
      !/votre demande concernant/i.test(l) &&
      !/voici les différentes étapes/i.test(l) &&
      !/je t['’]écoute/i.test(l)
  );
  if (preferShort) {
    return cleaned.slice(0, 6).join("\n").slice(0, 700);
  }
  return cleaned.join("\n").slice(0, 2500);
}
