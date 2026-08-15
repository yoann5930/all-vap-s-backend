import { normalizeLoose } from "@/lib/ava/normalize-loose";
import type { ConfidenceBand, SpeechLanguage } from "@/lib/ava/speech/types";

const FR_MARKERS =
  /\b(je|tu|vous|le|la|les|un|une|des|pas|quoi|où|ou|avec|dans|pour|magasin|menthe|fraise|cherche|veux|bonjour|salut)\b/i;
const EN_MARKERS =
  /\b(the|you|have|what|where|when|something|fruity|mint|please|show|open|today|tomorrow|not|too|sweet)\b/i;

/**
 * Une erreur STT ou un mot anglais produit ne doit pas basculer la langue.
 */
export function detectSpeechLanguage(text: string): {
  language: SpeechLanguage;
  confidence: ConfidenceBand;
} {
  const t = text.trim();
  if (!t) return { language: "fr", confidence: "low" };
  const loose = normalizeLoose(t);
  const tokens = loose.split(" ").filter(Boolean);
  const frHits = (t.match(new RegExp(FR_MARKERS, "gi")) || []).length;
  const enHits = (t.match(new RegExp(EN_MARKERS, "gi")) || []).length;
  const frRatio = frHits / Math.max(tokens.length, 1);
  const enRatio = enHits / Math.max(tokens.length, 1);

  const clearlyEn =
    enHits >= 2 &&
    enHits > frHits &&
    !FR_MARKERS.test(t) &&
    /^(do|does|what|where|when|why|how|i |you |show |are |is )/i.test(t);

  if (clearlyEn || (enRatio >= 0.5 && frHits === 0 && tokens.length >= 3)) {
    return { language: "en", confidence: enHits >= 3 ? "high" : "medium" };
  }
  if (frHits > 0 && enHits > 0) {
    return { language: "fr", confidence: "medium" };
  }
  return { language: "fr", confidence: frHits ? "high" : "medium" };
}
