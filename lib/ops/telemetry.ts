/**
 * Événements techniques structurés — lisibles plus tard par Nexus.
 * All Vap's reste autonome : aucun appel réseau vers Nexus.
 * Jamais de secret / mot de passe / token / cookie dans le payload.
 */
export const NEXUS_EVENT_NAMES = [
  "AUTH_FAILURE",
  "RATE_LIMIT_TRIGGERED",
  "ADMIN_ACCESS_DENIED",
  "SUSPICIOUS_REQUEST",
  "INJECTION_ATTEMPT",
  "XSS_ATTEMPT",
  "ABNORMAL_404_RATE",
  "ABNORMAL_500_RATE",
  "BRUTE_FORCE_PATTERN",
  "SERVICE_UNAVAILABLE",
  "API_TIMEOUT",
  "DATABASE_ERROR",
  "CONFIGURATION_CHANGE",
  "DEPLOYMENT_FAILURE",
] as const;

export type NexusEventName = (typeof NEXUS_EVENT_NAMES)[number];

export type OpsSeverity = "info" | "warning" | "error" | "critical";
export type OpsCategory = "security" | "availability" | "application";

export type OpsEvent = {
  timestamp: string;
  service: "allvaps";
  environment: string;
  category: OpsCategory;
  event: NexusEventName;
  severity: OpsSeverity;
  route?: string;
  requestId?: string;
  metadata?: Record<string, string | number | boolean>;
};

const SENSITIVE_KEY =
  /pass(word)?|passwd|secret|token|authorization|cookie|api[_-]?key|bearer|session|iban|pan|cvv|otp/i;

export function isSensitiveOpsKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

export function sanitizeOpsMetadata(
  input?: Record<string, unknown> | null
): Record<string, string | number | boolean> | undefined {
  if (!input) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(input)) {
    if (isSensitiveOpsKey(key)) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === "boolean" || typeof value === "number") {
      if (Number.isFinite(value)) out[key] = value;
      continue;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (SENSITIVE_KEY.test(trimmed)) continue;
      out[key] = trimmed.slice(0, 80);
    }
  }
  return Object.keys(out).length ? out : undefined;
}

export function opsEnvironment(): string {
  return (
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV ||
    "development"
  );
}

export function emitOpsEvent(partial: {
  event: NexusEventName;
  category: OpsCategory;
  severity: OpsSeverity;
  route?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}): OpsEvent {
  const payload: OpsEvent = {
    timestamp: new Date().toISOString(),
    service: "allvaps",
    environment: opsEnvironment(),
    category: partial.category,
    event: partial.event,
    severity: partial.severity,
  };
  if (partial.route) payload.route = partial.route.slice(0, 120);
  if (partial.requestId) payload.requestId = partial.requestId.slice(0, 80);
  const meta = sanitizeOpsMetadata(partial.metadata);
  if (meta) payload.metadata = meta;
  console.info("[ops]", JSON.stringify(payload));
  return payload;
}

/** Codes d'erreur API connus → événement Nexus (sans corrélation approximative). */
export function opsEventFromKnownApiError(code: string): {
  event: NexusEventName;
  category: OpsCategory;
  severity: OpsSeverity;
} | null {
  switch (code) {
    case "INVALID_CREDENTIALS":
    case "UNAUTHORIZED":
      return { event: "AUTH_FAILURE", category: "security", severity: "warning" };
    case "FORBIDDEN":
    case "STORE_NOT_ALLOWED":
      return { event: "ADMIN_ACCESS_DENIED", category: "security", severity: "warning" };
    case "CSRF_REJECTED":
      return { event: "SUSPICIOUS_REQUEST", category: "security", severity: "warning" };
    case "RATE_LIMITED":
      return { event: "RATE_LIMIT_TRIGGERED", category: "security", severity: "warning" };
    case "AUTH_DB_UNAVAILABLE":
      return { event: "DATABASE_ERROR", category: "availability", severity: "error" };
    default:
      return null;
  }
}
