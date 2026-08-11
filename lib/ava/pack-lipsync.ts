/**
 * Timeline de visèmes française — pack Ava (référence Cursor).
 * open / wide / round pilotent le shader facial du GLB compressé.
 */

export type PackViseme = { open: number; wide: number; round: number };

export type PackVisemeKeyframe = PackViseme & { start: number; end: number };

const VOWELS = new Set("aeiouyàâäéèêëîïôöùûüœ");
const CLOSED = new Set("bmp");
const WIDE = new Set("eéièêëisy");
const ROUND = new Set("ouôöùûüw");

export function visemeForCharacter(character = ""): PackViseme {
  const c = character.toLocaleLowerCase("fr-FR");
  if (CLOSED.has(c)) return { open: 0.04, wide: 0.05, round: 0 };
  if (ROUND.has(c)) return { open: 0.42, wide: 0, round: 0.9 };
  if (WIDE.has(c)) return { open: 0.36, wide: 0.9, round: 0 };
  if (VOWELS.has(c)) return { open: 0.72, wide: 0.25, round: 0.15 };
  if (/\s|[.,!?;:]/.test(c)) return { open: 0, wide: 0, round: 0 };
  return { open: 0.22, wide: 0.15, round: 0 };
}

export function createSpeechTimeline(
  text: string,
  durationMs: number
): PackVisemeKeyframe[] {
  const chars = [...text];
  const weights = chars.map((c) =>
    /\s/.test(c) ? 0.38 : /[.,!?;:]/.test(c) ? 1.7 : 1
  );
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let cursor = 0;
  return chars.map((char, index) => {
    const start = (cursor / total) * durationMs;
    cursor += weights[index];
    return {
      start,
      end: (cursor / total) * durationMs,
      ...visemeForCharacter(char),
    };
  });
}

/** Estimation durée TTS navigateur (alignée sur le pack de référence). */
export function estimateSpeechDurationMs(text: string, rate = 0.9): number {
  return Math.max(900, (text.length * 73) / rate);
}
