/**
 * Journal AVA — correlationId bout-en-bout, jamais de secret.
 */
export type AvaLogDomain =
  | "CORE"
  | "VOICE"
  | "ORDER"
  | "STOCK"
  | "MAIL"
  | "LOYALTY"
  | "SHIP"
  | "MEMORY"
  | "HEALTH"
  | "NICOTINE";

const SECRET_RE =
  /(password|passwd|secret|token|api[_-]?key|authorization|bearer\s+[a-z0-9._-]+)/i;

export function newAvaCorrelationId(): string {
  return `ava_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function sanitizeAvaLogText(raw: string, max = 180): string {
  const cleaned = String(raw || "")
    .replace(SECRET_RE, "[redacted]")
    .replace(/\n/g, " ")
    .trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max)}…`;
}

export function avaLog(
  domain: AvaLogDomain,
  correlationId: string,
  message: string,
  extra?: Record<string, string | number | boolean | null | undefined>,
) {
  const bits = extra
    ? Object.entries(extra)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ")
    : "";
  console.info(
    `[AVA][${correlationId}][${domain}] ${sanitizeAvaLogText(message)}${bits ? ` ${bits}` : ""}`,
  );
}
