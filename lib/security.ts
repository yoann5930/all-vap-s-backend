import { createHash, randomBytes } from "crypto";

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
    "https://www.allvaps.fr",
    "https://allvaps.fr",
  ];

  // Si APP_URL est apex ou www, accepter les deux
  const pair: string[] = [];
  if (appUrl.includes("allvaps.fr")) {
    pair.push("https://www.allvaps.fr", "https://allvaps.fr");
  }

  return Array.from(new Set([appUrl, ...pair, ...extras, ...defaults].filter(Boolean)));
}

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true; // curl / same-origin sans Origin (mobile apps / SSR)
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

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateSecureToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

/** Sanitize basique anti-XSS pour chaînes affichées hors React escape. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
