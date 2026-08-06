/**
 * Confiance de transcription — confirmation avant action sensible.
 */
export type TranscriptionConfidence = "high" | "medium" | "low";

const UNCERTAIN_MARKERS = [
  /\b(euh+|hum+|hmm+)\b/i,
  /\b(truc|machin|bidule)\b/i,
  /^.{1,2}$/,
];

export function estimateTranscriptionConfidence(text: string): TranscriptionConfidence {
  const t = text.trim();
  if (!t) return "low";
  if (UNCERTAIN_MARKERS.some((re) => re.test(t))) return "low";
  if (t.split(/\s+/).length < 2) return "medium";
  if (t.length < 8) return "medium";
  return "high";
}

export function needsConfirmation(text: string, sensitive = false): boolean {
  const c = estimateTranscriptionConfidence(text);
  if (sensitive) return c !== "high";
  return c === "low";
}

export function confirmationPrompt(text: string): string {
  const short = text.length > 80 ? `${text.slice(0, 77)}…` : text;
  return `J'ai compris : « ${short} ». C'est bien cela ?`;
}
