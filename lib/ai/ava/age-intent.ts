/**
 * Détection d’âge A.V.A. Client — STRICTEMENT séparée des corrections produit / matériel.
 *
 * Règle : un verrouillage +18 n’est autorisé que sur un signal d’âge explicite.
 * « Non, c’est une Legend 2 » / « XROS 4 » / « 18 mg » / « 0.15 ohm » ≠ âge.
 */

export type AgeIntent = "underage" | "adult" | "unknown";

function normalize(message: string): string {
  return message
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extraire un âge déclaré en années si la phrase parle clairement d’âge. */
function extractDeclaredAgeYears(text: string): number | null {
  // « j'ai 17 ans », « j ai 18 ans », « j'ai plus de 18 ans »
  const m =
    text.match(/\bj\s*ai\s+(?:plus\s+de\s+|moins\s+de\s+)?(\d{1,2})\s*ans\b/) ||
    text.match(/\b(?:age|âge)\s*[:=]?\s*(\d{1,2})\b/) ||
    text.match(/\bje\s+suis\s+(?:age\s+(?:de\s+)?)?(\d{1,2})\s*ans\b/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 1 && n <= 120 ? n : null;
}

/** Contextes produit / nicotine / version qui ne doivent JAMAIS être lus comme âge. */
function looksLikeProductOrTechnicalContext(text: string): boolean {
  return (
    /\b\d+\s*mg\b/.test(text) ||
    /\b\d+\s*ml\b/.test(text) ||
    /\b0[.,]\d+\s*ohm\b/.test(text) ||
    /\bohm\b/.test(text) ||
    /\bxros\b|\bdrag\b|\blegend\b|\baegis\b|\bgen\s*\d|\bsubohm\b|\bz\s*sub/.test(text) ||
    /\bresistance\b|\bcoil\b|\bpod\b|\bkit\b|\bbox\b/.test(text) ||
    /\bje\s+me\s+suis\s+trompe\b|\bc[' ]est\s+(un|une|la|le)\b|\bpas\s+(une?\s+)?xros\b/.test(
      text
    ) ||
    /\bcorrection\b|\bplutot\b|\bau\s+lieu\b/.test(text)
  );
}

/**
 * Intent âge métier.
 * - underage → bloquer
 * - adult → confirmer (ne bloque pas)
 * - unknown → ignorer (ne bloque PAS)
 */
export function detectAgeIntent(message: string): AgeIntent {
  const text = normalize(message);
  if (!text) return "unknown";

  // Corrections / matériel / specs techniques : hors scope âge
  if (looksLikeProductOrTechnicalContext(text)) {
    // Sauf déclaration d’âge explicite coexistant (« j'ai 17 ans et une XROS »)
    const age = extractDeclaredAgeYears(text);
    if (age != null) {
      return age < 18 ? "underage" : "adult";
    }
    if (/\bje\s+(suis\s+)?mineur\b/.test(text) || /\bmoins\s+de\s+18\s*ans\b/.test(text)) {
      return "underage";
    }
    return "unknown";
  }

  // Signaux underage explicites
  if (
    /\bje\s+(suis\s+)?mineur\b/.test(text) ||
    /\bje\s+n\s*ai\s+pas\s+(encore\s+)?18\b/.test(text) ||
    /\bpas\s+(encore\s+)?majeur\b/.test(text) ||
    /\bmoins\s+de\s+18\s*ans\b/.test(text) ||
    /\b< ?18\s*ans\b/.test(text)
  ) {
    return "underage";
  }

  const age = extractDeclaredAgeYears(text);
  if (age != null) {
    return age < 18 ? "underage" : "adult";
  }

  // Confirmation adulte explicite (sans « 18 mg »)
  if (
    /\bje\s+suis\s+majeur\b/.test(text) ||
    /\bj\s*ai\s+(bien\s+)?18\s*ans\b/.test(text) ||
    /\bj\s*ai\s+plus\s+de\s+18\s*ans\b/.test(text) ||
    (/^(oui|yes)\b/.test(text) &&
      /\b(18\s*ans|majeur|age|majorite)\b/.test(text) &&
      !/\bmg\b/.test(text))
  ) {
    return "adult";
  }

  // IMPORTANT : ne plus traiter « non » / « oui » seuls comme âge
  // (c’était la cause du faux positif « Non, c’est une Legend 2 »)
  return "unknown";
}

/**
 * Compatibilité historique.
 * true = majeur confirmé, false = mineur → bloquer, null = indifférent.
 */
export function isAgeConfirmed(message: string): boolean | null {
  const intent = detectAgeIntent(message);
  if (intent === "underage") return false;
  if (intent === "adult") return true;
  return null;
}
