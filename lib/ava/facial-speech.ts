export const AVA_SPEECH_BOUNDARY_EVENT = "ava:speech-boundary";

export type AvaFacialViseme =
  | "AA"
  | "E"
  | "I"
  | "O"
  | "U"
  | "MBP"
  | "FV"
  | "L"
  | "CH"
  | "RR"
  | "REST";

export type AvaSpeechBoundaryDetail = {
  text: string;
  charIndex: number;
  ended?: boolean;
};

const VOWELS: Record<string, AvaFacialViseme> = {
  a: "AA",
  à: "AA",
  â: "AA",
  ä: "AA",
  e: "E",
  é: "E",
  è: "E",
  ê: "E",
  ë: "E",
  œ: "E",
  i: "I",
  î: "I",
  ï: "I",
  y: "I",
  o: "O",
  ô: "O",
  ö: "O",
  u: "U",
  ù: "U",
  û: "U",
  ü: "U",
};

export function frenchVisemeAt(text: string, charIndex: number): AvaFacialViseme {
  const normalized = text.toLocaleLowerCase("fr-FR");
  const index = Math.max(0, Math.min(charIndex, Math.max(0, normalized.length - 1)));
  const pair = normalized.slice(index, index + 2);
  if (pair === "ch" || pair === "sh") return "CH";
  if (pair === "ou") return "U";

  const character = normalized[index] ?? "";
  if (!character || /\s|[.,!?;:]/.test(character)) return "REST";
  if ("bmp".includes(character)) return "MBP";
  if ("fv".includes(character)) return "FV";
  if (character === "l") return "L";
  if (character === "r") return "RR";
  if (character === "j" || character === "g") return "CH";
  return VOWELS[character] ?? "E";
}

export function emitAvaSpeechBoundary(detail: AvaSpeechBoundaryDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<AvaSpeechBoundaryDetail>(AVA_SPEECH_BOUNDARY_EVENT, { detail })
  );
}
