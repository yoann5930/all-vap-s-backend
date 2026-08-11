/**
 * Timeline de visèmes française — expressive pour shader facial Ava.
 */

export type PackViseme = { open: number; wide: number; round: number };

export type PackVisemeKeyframe = PackViseme & { start: number; end: number };

const CLOSED = new Set("bmp");
const WIDE = new Set("eéièêëiy");
const ROUND = new Set("ouôöùûüw");
const OPEN = new Set("aàâäá");
const MID = new Set("éèêë");

/** Digrammes FR courants (priorité sur le caractère seul). */
const DIGRAPHS: Array<[string, PackViseme]> = [
  ["ou", { open: 0.48, wide: 0.05, round: 0.95 }],
  ["on", { open: 0.55, wide: 0.1, round: 0.75 }],
  ["an", { open: 0.62, wide: 0.2, round: 0.35 }],
  ["en", { open: 0.58, wide: 0.25, round: 0.3 }],
  ["in", { open: 0.5, wide: 0.55, round: 0.15 }],
  ["un", { open: 0.45, wide: 0.15, round: 0.7 }],
  ["ch", { open: 0.28, wide: 0.35, round: 0.25 }],
  ["gn", { open: 0.3, wide: 0.4, round: 0.1 }],
  ["eu", { open: 0.42, wide: 0.2, round: 0.65 }],
  ["au", { open: 0.5, wide: 0.08, round: 0.85 }],
  ["eau", { open: 0.52, wide: 0.08, round: 0.88 }],
  ["oi", { open: 0.55, wide: 0.35, round: 0.45 }],
  ["ai", { open: 0.7, wide: 0.75, round: 0.1 }],
  ["ei", { open: 0.65, wide: 0.7, round: 0.1 }],
];

export function visemeForCharacter(character = ""): PackViseme {
  const c = character.toLocaleLowerCase("fr-FR");
  if (CLOSED.has(c)) return { open: 0.02, wide: 0.08, round: 0.05 };
  if (ROUND.has(c)) return { open: 0.5, wide: 0.05, round: 0.95 };
  if (WIDE.has(c) || MID.has(c)) return { open: 0.48, wide: 0.95, round: 0.05 };
  if (OPEN.has(c)) return { open: 0.95, wide: 0.35, round: 0.12 };
  if ("aá".includes(c)) return { open: 0.92, wide: 0.3, round: 0.1 };
  if (VOWEL_FALLBACK.has(c)) return { open: 0.78, wide: 0.28, round: 0.18 };
  if (/\s/.test(c)) return { open: 0.04, wide: 0.02, round: 0 };
  if (/[.,!?;:]/.test(c)) return { open: 0, wide: 0, round: 0 };
  // Consonnes moyennes (d,t,n,l,s,r…) — micro-ouverture pour le rythme
  return { open: 0.28, wide: 0.2, round: 0.08 };
}

const VOWEL_FALLBACK = new Set("aeiouyàâäéèêëîïôöùûüœ");

export function createSpeechTimeline(
  text: string,
  durationMs: number
): PackVisemeKeyframe[] {
  const lower = text.toLocaleLowerCase("fr-FR");
  const tokens: Array<{ char: string; weight: number; viseme: PackViseme }> = [];
  let i = 0;
  while (i < lower.length) {
    let matched = false;
    for (const [dig, vis] of DIGRAPHS) {
      if (lower.startsWith(dig, i)) {
        tokens.push({
          char: dig,
          weight: dig.length * 1.15,
          viseme: vis,
        });
        i += dig.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    const ch = lower[i];
    const orig = text[i] ?? ch;
    tokens.push({
      char: orig,
      weight: /\s/.test(ch) ? 0.32 : /[.,!?;:]/.test(ch) ? 1.85 : 1,
      viseme: visemeForCharacter(ch),
    });
    i += 1;
  }

  const total = tokens.reduce((a, t) => a + t.weight, 0) || 1;
  let cursor = 0;
  return tokens.map((t) => {
    const start = (cursor / total) * durationMs;
    cursor += t.weight;
    return {
      start,
      end: (cursor / total) * durationMs,
      ...t.viseme,
    };
  });
}

/** Échantillonnage lissé entre deux keyframes. */
export function sampleVisemeAt(
  timeline: PackVisemeKeyframe[],
  elapsedMs: number
): PackViseme {
  if (!timeline.length) return { open: 0, wide: 0, round: 0 };
  if (elapsedMs < timeline[0].start) return timeline[0];
  const last = timeline[timeline.length - 1];
  if (elapsedMs >= last.end) return { open: 0, wide: 0, round: 0 };

  for (let i = 0; i < timeline.length; i++) {
    const k = timeline[i];
    if (elapsedMs >= k.start && elapsedMs < k.end) {
      const next = timeline[i + 1];
      const span = Math.max(1, k.end - k.start);
      const t = (elapsedMs - k.start) / span;
      // Ease in-out léger pour éviter les à-coups
      const e = t * t * (3 - 2 * t);
      if (!next) return k;
      return {
        open: k.open + (next.open - k.open) * e * 0.35,
        wide: k.wide + (next.wide - k.wide) * e * 0.35,
        round: k.round + (next.round - k.round) * e * 0.35,
      };
    }
  }
  return { open: 0, wide: 0, round: 0 };
}

/** Durée TTS — un peu plus vive pour un lip-sync visible. */
export function estimateSpeechDurationMs(text: string, rate = 0.95): number {
  return Math.max(800, (text.length * 62) / rate);
}
