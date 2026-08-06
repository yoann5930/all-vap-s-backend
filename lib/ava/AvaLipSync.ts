/**
 * Pilotage morph targets / visèmes pour AVA_HOLOGRAM.glb
 */
export type AvaViseme =
  | "sil"
  | "aa"
  | "E"
  | "I"
  | "O"
  | "U"
  | "PP"
  | "FF"
  | "TH"
  | "DD"
  | "kk"
  | "CH"
  | "SS"
  | "nn"
  | "RR";

export type AvaLipSyncKeyframe = {
  t: number; // seconds
  viseme: AvaViseme;
  weight?: number;
};

const VISEME_TO_MORPH: Record<AvaViseme, string[]> = {
  sil: ["viseme_sil"],
  aa: ["viseme_aa", "jawOpen", "mouthOpen"],
  E: ["viseme_E"],
  I: ["viseme_I"],
  O: ["viseme_O", "mouthFunnel"],
  U: ["viseme_U", "mouthPucker"],
  PP: ["mouthClose", "mouthPressLeft", "mouthPressRight"],
  FF: ["mouthFunnel"],
  TH: ["viseme_I"],
  DD: ["viseme_E"],
  kk: ["jawOpen"],
  CH: ["mouthFunnel"],
  SS: ["viseme_I"],
  nn: ["viseme_E"],
  RR: ["viseme_E"],
};

/** Mapping approximatif FR caractères → visème */
export function frenchCharToViseme(ch: string): AvaViseme {
  const c = ch.toLowerCase();
  if ("aâà".includes(c)) return "aa";
  if ("eéèêë".includes(c)) return "E";
  if ("iîïy".includes(c)) return "I";
  if ("oô".includes(c)) return "O";
  if ("uùûü".includes(c)) return "U";
  if ("mbp".includes(c)) return "PP";
  if ("fv".includes(c)) return "FF";
  if ("sz".includes(c)) return "SS";
  if ("tdn".includes(c)) return "DD";
  if ("kg".includes(c)) return "kk";
  if ("lr".includes(c)) return "RR";
  if ("cj".includes(c)) return "CH";
  return "sil";
}

export function textToVisemeTimeline(
  text: string,
  durationSec: number,
): AvaLipSyncKeyframe[] {
  const chars = text.replace(/\s+/g, " ").trim().split("");
  if (!chars.length || durationSec <= 0) return [{ t: 0, viseme: "sil", weight: 0 }];
  const step = durationSec / chars.length;
  return chars.map((ch, i) => ({
    t: i * step,
    viseme: frenchCharToViseme(ch),
    weight: ch === " " ? 0 : 0.85,
  }));
}

export function resolveMorphNames(viseme: AvaViseme): string[] {
  return VISEME_TO_MORPH[viseme] || ["viseme_sil"];
}

export function sampleTimeline(
  timeline: AvaLipSyncKeyframe[],
  t: number,
): { viseme: AvaViseme; weight: number; morphs: string[] } {
  if (!timeline.length) return { viseme: "sil", weight: 0, morphs: ["viseme_sil"] };
  let cur = timeline[0];
  for (const k of timeline) {
    if (k.t <= t) cur = k;
    else break;
  }
  return {
    viseme: cur.viseme,
    weight: cur.weight ?? 1,
    morphs: resolveMorphNames(cur.viseme),
  };
}
