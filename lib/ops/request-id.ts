/**
 * Corrélation HTTP — header x-request-id (Edge-safe).
 * Réutilise un id client s'il est déjà présent et sûr.
 */
const SAFE_ID = /^[A-Za-z0-9._:-]{8,80}$/;

export const REQUEST_ID_HEADER = "x-request-id";

export function resolveRequestId(request: Request): string {
  const incoming =
    request.headers.get(REQUEST_ID_HEADER) ||
    request.headers.get("x-correlation-id") ||
    "";
  const trimmed = incoming.trim();
  if (SAFE_ID.test(trimmed)) return trimmed;
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
