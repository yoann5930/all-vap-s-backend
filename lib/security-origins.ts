/**
 * Helpers CSRF / Origin — Edge-safe (pas de Node crypto).
 * Utilisé par middleware.ts.
 * Doit rester aligné avec lib/security.ts (inventaire.allvaps.fr inclus).
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
    "https://inventaire.allvaps.fr",
  ];

  const pair: string[] = [];
  if (appUrl.includes("allvaps.fr")) {
    pair.push(
      "https://www.allvaps.fr",
      "https://allvaps.fr",
      "https://inventaire.allvaps.fr"
    );
  }

  if (process.env.VERCEL_URL) {
    pair.push(`https://${process.env.VERCEL_URL.replace(/^https?:\/\//, "")}`);
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    pair.push(
      `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/^https?:\/\//, "")}`
    );
  }

  return Array.from(new Set([appUrl, ...pair, ...extras, ...defaults].filter(Boolean)));
}

export function isAllowedOrigin(origin: string | null, requestHost?: string): boolean {
  if (!origin) return true;
  try {
    const o = new URL(origin);
    if (requestHost) {
      const host = requestHost.split(":")[0].toLowerCase();
      if (o.hostname.toLowerCase() === host) return true;
    }
    if (
      process.env.NODE_ENV !== "production" &&
      (o.hostname === "localhost" || o.hostname === "127.0.0.1" || o.hostname === "::1")
    ) {
      return true;
    }
    if (
      o.hostname.endsWith(".vercel.app") ||
      o.hostname.endsWith(".trycloudflare.com")
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
