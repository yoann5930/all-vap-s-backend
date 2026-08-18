/**
 * Plan TTS technique — compte les phrases que le navigateur devrait lire.
 * Aucun audio, aucune clé vocale.
 */

const SENTENCE_SPLIT = /(?<=[.!?…])\s+(?=[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ«"0-9])/u;

export function splitSpokenSentences(text: string): string[] {
  const cleaned = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];
  const parts = cleaned
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [cleaned];
}

export function planTtsSegments(avaText: string): {
  queued: boolean;
  segments: number;
  segmentsExpected: number;
  segmentsQueued: number;
  completed: boolean;
} {
  const segments = splitSpokenSentences(avaText);
  const n = segments.length;
  return {
    queued: n > 0,
    segments: n,
    segmentsExpected: n,
    segmentsQueued: n,
    completed: n > 0,
  };
}
