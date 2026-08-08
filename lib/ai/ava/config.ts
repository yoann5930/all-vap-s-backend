/**
 * Configuration A.V.A. — conversation vocale continue + recherche catalogue.
 * Pas de secrets. Surcharge possible via process.env (côté serveur) ou valeurs par défaut.
 */

function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v == null || v === "") return fallback;
  return /^(1|true|yes|on)$/i.test(v.trim());
}

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Constantes client-safe (dupliquées pour hooks navigateur). */
export const AVA_VOICE_CONFIG = {
  continuousMode: true,
  autoResumeListening: true,
  /** Silence après parole avant de traiter (ms) */
  speechEndSilenceMs: 2000,
  /** Pause max avant forcer le traitement ou relancer (ms) */
  maxUserPauseMs: 10000,
  /** Anti-écho après fin TTS avant reprise écoute (ms) */
  postTtsEchoDelayMs: 500,
  /** Interruption client pendant TTS — désactivé par défaut (faux positifs HP) */
  bargeInEnabled: false,
  /** Relances Web Speech avant soft-reset (Chrome coupe souvent onend) */
  maxRecognitionRestarts: 40,
  recognitionRestartBaseMs: 400,
} as const;

export const AVA_SEARCH_CONFIG = {
  productSearchEnabled: true,
  maxProductResults: 3,
  onlyInStockProducts: true,
  /** catalogStatus exclus de la vente A.V.A. */
  excludedCatalogStatuses: ["archive", "brut_importe"] as string[],
  /** Statuts « à vérifier » : proposables avec mention honnête */
  verifyStatuses: ["a_verifier"] as string[],
} as const;

/** Lecture serveur (env) pour overrides éventuels */
export function getAvaServerSearchConfig() {
  return {
    productSearchEnabled: envBool("AVA_PRODUCT_SEARCH_ENABLED", AVA_SEARCH_CONFIG.productSearchEnabled),
    maxProductResults: envInt("AVA_MAX_PRODUCT_RESULTS", AVA_SEARCH_CONFIG.maxProductResults),
    onlyInStockProducts: envBool("AVA_ONLY_IN_STOCK_PRODUCTS", AVA_SEARCH_CONFIG.onlyInStockProducts),
  };
}
