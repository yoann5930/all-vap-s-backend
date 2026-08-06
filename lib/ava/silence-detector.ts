/**
 * Détection de silence / absence de réponse orale — bascule texte humaine.
 */
export const SILENCE_HINTS = [
  "Prenez votre temps.",
  "Vous pouvez aussi me l'écrire.",
  "Je suis là — vous pouvez répondre à l'oral ou par écrit, comme vous préférez.",
  "Vous pouvez m'envoyer une photo si c'est plus simple.",
  "On peut continuer par écrit, aucun souci.",
] as const;

/** Délai avant 1ʳᵉ invitation texte (ms) */
export const SILENCE_FIRST_HINT_MS = 8000;
/** Délai avant ouverture auto du clavier (ms) */
export const SILENCE_AUTO_TEXT_MS = 16000;
/** Max relances vocales avant bascule texte forcée */
export const MAX_VOICE_PROMPTS = 2;

export function pickSilenceHint(index: number): string {
  return SILENCE_HINTS[Math.abs(index) % SILENCE_HINTS.length];
}

export function shouldOpenTextAfterSilence(params: {
  listeningMs: number;
  promptCount: number;
  emptyResults: number;
}): boolean {
  if (params.emptyResults >= 3) return true;
  if (params.promptCount >= MAX_VOICE_PROMPTS) return true;
  if (params.listeningMs >= SILENCE_AUTO_TEXT_MS) return true;
  return false;
}

export function shouldShowSilenceHint(params: {
  listeningMs: number;
  promptCount: number;
}): boolean {
  return params.listeningMs >= SILENCE_FIRST_HINT_MS && params.promptCount < MAX_VOICE_PROMPTS;
}
