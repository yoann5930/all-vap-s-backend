/**
 * Config Fidelatoo VM — connecteur interne uniquement.
 * Aucun appel API Fidelatoo. Aucun mot de passe A.V.A. ici.
 */

export const AVA_FIDELATOO_EMAIL = "avaallvaps@gmail.com";

export type FidelatooOrchestratorConfig = {
  enabled: boolean;
  /** URL HTTPS du service privé d'orchestration (jamais ADB/Appium publics). */
  baseUrl: string | null;
  hasSecret: boolean;
  configured: boolean;
  /** Mock local explicite — tests UI uniquement, jamais en prod réelle. */
  mockEnabled: boolean;
  allowedOrigins: string[];
  commandTtlSec: number;
  qrTtlSec: number;
  avaEmail: string;
};

function truthy(v: string | undefined, defaultValue = false): boolean {
  if (v == null || v === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function isProdPublic(): boolean {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  return /allvaps\.fr/i.test(appUrl) && !/localhost|127\.0\.0\.1/i.test(appUrl);
}

export function getFidelatooOrchestratorConfig(): FidelatooOrchestratorConfig {
  const baseUrl = (process.env.FIDELATOO_ORCHESTRATOR_URL || "").trim().replace(/\/$/, "") || null;
  const hasSecret = !!(process.env.FIDELATOO_ORCHESTRATOR_SECRET || "").trim();
  const enabled = truthy(process.env.FIDELATOO_ORCHESTRATOR_ENABLED, false);
  const mockRequested = truthy(process.env.FIDELATOO_ORCHESTRATOR_MOCK, false);
  // Mock interdit sur le domaine public de production
  const mockEnabled = mockRequested && !isProdPublic();

  const extras = (process.env.FIDELATOO_ORCHESTRATOR_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);

  const commandTtlSec = Math.min(
    Math.max(Number(process.env.FIDELATOO_COMMAND_TTL_SEC || 60) || 60, 15),
    300
  );
  const qrTtlSec = Math.min(
    Math.max(Number(process.env.FIDELATOO_QR_TTL_SEC || 120) || 120, 30),
    600
  );

  const avaEmail =
    (process.env.FIDELATOO_AVA_ACCOUNT_EMAIL || "").trim().toLowerCase() || AVA_FIDELATOO_EMAIL;

  return {
    enabled,
    baseUrl,
    hasSecret,
    configured: !!(enabled && baseUrl && hasSecret),
    mockEnabled,
    allowedOrigins: extras,
    commandTtlSec,
    qrTtlSec,
    avaEmail,
  };
}

export function getFidelatooPublicConfig() {
  const cfg = getFidelatooOrchestratorConfig();
  return {
    enabled: cfg.enabled,
    configured: cfg.configured,
    mockEnabled: cfg.mockEnabled,
    avaEmail: cfg.avaEmail,
    commandTtlSec: cfg.commandTtlSec,
    qrTtlSec: cfg.qrTtlSec,
  };
}
