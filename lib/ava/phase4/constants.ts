/**
 * Phase 4 — constantes métier A.V.A.
 * Aucune donnée fictive. Seules les fiches VERIFIED sont exposées au public.
 */

/** Sous ce seuil : demander des infos complémentaires, jamais conclure. */
export const AVA_CONFIDENCE_THRESHOLD = 0.75;

export const AVA_PHASE4_STATUS = {
  official: "❌ PRÉPRODUCTION NON VALIDÉE",
  phaseLabel: "⚠️ PHASE 4 — INFRASTRUCTURE MÉTIER A.V.A.",
  neverShow: "✅ PRÉPRODUCTION VALIDÉE",
} as const;

/** Exclusions absolues (Puff / JNR / jetables). */
export const AVA_EXCLUDED_PATTERN =
  /\b(puff|jnr|jetable|disposables?|puff\s*bar|elf\s*bar)\b/i;

export function isAvaPhase4Excluded(text: string): {
  excluded: boolean;
  reason: string | null;
} {
  if (!text?.trim()) return { excluded: false, reason: null };
  if (/\bjnr\b/i.test(text)) {
    return {
      excluded: true,
      reason: "La marque JNR n'est pas prise en charge par A.V.A.",
    };
  }
  if (AVA_EXCLUDED_PATTERN.test(text)) {
    return {
      excluded: true,
      reason: "Les puffs et produits jetables sont exclus d'A.V.A.",
    };
  }
  return { excluded: false, reason: null };
}
