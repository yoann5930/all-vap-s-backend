/**
 * Détection du mode AVA_ASSISTANCE_MATERIEL.
 * Les recherches d'e-liquide / saveur ne doivent PAS ouvrir ce mode.
 */
import intents from "@/data/ava/hardware-intents.json";
import { normalizeLoose } from "@/lib/ava/normalize-loose";

export type HardwareIntentResult = {
  mode: "AVA_ASSISTANCE_MATERIEL" | null;
  isHardware: boolean;
  isDanger: boolean;
  matchedKeywords: string[];
  matchedProblems: string[];
  matchedDanger: string[];
};

function includesAny(hay: string, needles: string[]): string[] {
  return needles.filter((n) => hay.includes(normalizeLoose(n)));
}

export function detectHardwareIntent(message: string): HardwareIntentResult {
  const raw = message || "";
  const hay = normalizeLoose(raw);

  // Exclure clairement les demandes produit / e-liquide
  const exclude = (intents.excludeProductSearchIntents as string[]).some((ex) => {
    const n = normalizeLoose(ex);
    return (
      hay.includes(n) &&
      !/(résistance|resistance|cartouche|pod|box|kit|clearomiseur|atomiseur)/.test(hay)
    );
  });

  // « e-liquide fruité » etc. sans matériel → pas hardware
  if (
    exclude &&
    !includesAny(hay, intents.hardwareKeywords as string[]).length &&
    !includesAny(hay, intents.problemPhrases as string[]).length
  ) {
    return {
      mode: null,
      isHardware: false,
      isDanger: false,
      matchedKeywords: [],
      matchedProblems: [],
      matchedDanger: [],
    };
  }

  const matchedDanger = includesAny(hay, intents.dangerPhrases as string[]);
  const matchedProblems = includesAny(hay, intents.problemPhrases as string[]);
  const matchedKeywords = includesAny(hay, intents.hardwareKeywords as string[]);

  const isDanger = matchedDanger.length > 0;
  const isHardware =
    isDanger ||
    matchedProblems.length > 0 ||
    (matchedKeywords.length > 0 &&
      /(souci|problème|probleme|marche|fuit|allume|charge|erreur|résistance|resistance|compatible|remplir|watt)/.test(
        hay
      ));

  return {
    mode: isHardware ? "AVA_ASSISTANCE_MATERIEL" : null,
    isHardware,
    isDanger,
    matchedKeywords,
    matchedProblems,
    matchedDanger,
  };
}
