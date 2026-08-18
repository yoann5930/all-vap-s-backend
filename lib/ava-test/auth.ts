/**
 * Auth passerelle de test AVA — secret serveur uniquement.
 * Ne jamais logger le token, ni le comparer en clair dans les traces.
 */
import { timingSafeEqual } from "node:crypto";

export function isAvaTestApiEnabled(): boolean {
  const raw = (process.env.AVA_TEST_API_ENABLED || "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes" || raw === "on";
}

function expectedToken(): string {
  return (process.env.AVA_TEST_API_TOKEN || "").trim();
}

export function avaTestTokenConfigured(): boolean {
  return expectedToken().length >= 16;
}

function safeEqualString(got: string, expected: string): boolean {
  const left = Buffer.from(got, "utf8");
  const right = Buffer.from(expected, "utf8");
  if (left.length !== right.length) {
    timingSafeEqual(right, right);
    return false;
  }
  return timingSafeEqual(left, right);
}

export function extractBearerToken(authorization: string | null | undefined): string | null {
  const raw = (authorization || "").trim();
  if (!raw.toLowerCase().startsWith("bearer ")) return null;
  const token = raw.slice(7).trim();
  return token || null;
}

export type AvaTestAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 404 | 503; errorCode: "AVA_TEST_DISABLED" | "AVA_TEST_UNAUTHORIZED"; message: string };

/**
 * Ordre : désactivé → 404 (pas de fuite d'existence).
 * Activé sans token env → 503.
 * Token manquant / invalide → 401.
 */
export function authorizeAvaTestRequest(authorization: string | null | undefined): AvaTestAuthResult {
  if (!isAvaTestApiEnabled()) {
    return {
      ok: false,
      status: 404,
      errorCode: "AVA_TEST_DISABLED",
      message: "Not found",
    };
  }
  if (!avaTestTokenConfigured()) {
    return {
      ok: false,
      status: 503,
      errorCode: "AVA_TEST_UNAUTHORIZED",
      message: "Passerelle de test indisponible",
    };
  }
  const got = extractBearerToken(authorization);
  if (!got || !safeEqualString(got, expectedToken())) {
    return {
      ok: false,
      status: 401,
      errorCode: "AVA_TEST_UNAUTHORIZED",
      message: "Non autorisé",
    };
  }
  return { ok: true };
}

/** Identifiants de session de test uniquement — jamais un userId Prisma. */
export function isAvaTestSessionId(sessionId: string): boolean {
  const id = (sessionId || "").trim();
  if (id.length < 4 || id.length > 80) return false;
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) return false;
  return /^(test|ava-test|demo)[-_.]/i.test(id);
}

export function hmacKeyForSessions(): string {
  return expectedToken();
}
