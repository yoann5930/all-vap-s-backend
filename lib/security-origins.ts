/**
 * Helpers CSRF / Origin — Edge-safe (pas de Node crypto).
 * Utilisé par middleware.ts et les routes API.
 */

/** Origines autorisées pour les mutations cookie-auth. */
export function getAllowedOrigins(): string[] {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const extras = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const defaults = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:3002",
    "http://127.0.0.1:3002",
    "http://localhost:3003",
    "http://127.0.0.1:3003",
    "https://www.allvaps.fr",
    "https://allvaps.fr",
  ];

  const pair: string[] = [];
  if (appUrl.includes("allvaps.fr")) {
    pair.push("https://www.allvaps.fr", "https://allvaps.fr");
  }

  return Array.from(new Set([appUrl, ...pair, ...extras, ...defaults].filter(Boolean)));
}

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  try {
    const o = new URL(origin);
    if (
      process.env.NODE_ENV !== "production" &&
      (o.hostname === "localhost" || o.hostname === "127.0.0.1" || o.hostname === "::1")
    ) {
      return true;
    }
  } catch {
    /* fall through */
  }
  const allowed = getAllowedOrigins();
  try {
    const o = new URL(origin).origin;
    return allowed.some((a) => {
      try {
        return new URL(a).origin === o;
      } catch {
        return a === o;
      }
    });
  } catch {
    return false;
  }
}

/** Vérifie Origin/Referer pour les requêtes mutantes authentifiées par cookie. */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin && !isAllowedOrigin(origin)) {
    throw new Error("CSRF_REJECTED");
  }
  if (!origin) {
    const referer = request.headers.get("referer");
    if (referer) {
      try {
        const refOrigin = new URL(referer).origin;
        if (!isAllowedOrigin(refOrigin)) throw new Error("CSRF_REJECTED");
      } catch (e) {
        if (e instanceof Error && e.message === "CSRF_REJECTED") throw e;
      }
    }
  }
}
