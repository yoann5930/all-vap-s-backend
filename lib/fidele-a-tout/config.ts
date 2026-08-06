/**
 * Architecture Fidèle à Tout — pas de synchronisation inventée.
 * Tant que les accès officiels ne sont pas renseignés, le client reste en mode « prêt ».
 */

export type FideleAToutSyncStatus =
  | "unlinked"
  | "pending"
  | "linked"
  | "error"
  | "disabled";

export type FideleAToutConfig = {
  /** Intégration activée côté produit (UI + endpoints). */
  enabled: boolean;
  /** Si true : aucun point local — uniquement via Fidèle à Tout une fois connecté. */
  syncRequired: boolean;
  /** Mode test (sandbox / dry-run) dès que les accès existent. */
  testMode: boolean;
  apiBaseUrl: string | null;
  hasApiKey: boolean;
  hasMerchantId: boolean;
  androidPackageHint: string | null;
  configured: boolean;
};

function truthy(v: string | undefined, defaultValue = false): boolean {
  if (v == null || v === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

export function getFideleAToutConfig(): FideleAToutConfig {
  const apiBaseUrl = (process.env.FIDELE_A_TOUT_API_URL || "").trim() || null;
  const hasApiKey = !!(process.env.FIDELE_A_TOUT_API_KEY || "").trim();
  const hasMerchantId = !!(process.env.FIDELE_A_TOUT_MERCHANT_ID || "").trim();
  const enabled = truthy(process.env.FIDELE_A_TOUT_ENABLED, false);
  const syncRequired = truthy(process.env.FIDELE_A_TOUT_SYNC_REQUIRED, false);
  const testMode = truthy(process.env.FIDELE_A_TOUT_TEST_MODE, true);
  const configured = !!(apiBaseUrl && hasApiKey && hasMerchantId);

  return {
    enabled,
    syncRequired,
    testMode,
    apiBaseUrl,
    hasApiKey,
    hasMerchantId,
    androidPackageHint: (process.env.FIDELE_A_TOUT_ANDROID_PACKAGE || "").trim() || null,
    configured,
  };
}

/** Points locaux autorisés seulement si Fidèle à Tout n'impose pas encore la sync. */
export function mayAwardLocalLoyaltyPoints(): boolean {
  const cfg = getFideleAToutConfig();
  if (cfg.syncRequired) return false;
  return true;
}

export function getFideleAToutPublicStatus() {
  const cfg = getFideleAToutConfig();
  return {
    enabled: cfg.enabled,
    syncRequired: cfg.syncRequired,
    testMode: cfg.testMode,
    configured: cfg.configured,
    readyForOfficialCredentials: !cfg.configured,
    message: cfg.configured
      ? cfg.testMode
        ? "Fidèle à Tout configuré (mode test)."
        : "Fidèle à Tout configuré (production)."
      : "Compte Fidèle à Tout All Vap's non encore connecté — architecture prête.",
  };
}
