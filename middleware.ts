import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { isAllowedOrigin } from "@/lib/security-origins";
import { permissionsPolicyForPath } from "@/lib/ai/web-voice-permissions";
import { emitOpsEvent } from "@/lib/ops/telemetry";
import { REQUEST_ID_HEADER, resolveRequestId } from "@/lib/ops/request-id";
import {
  AUTH_COOKIE_NAME,
  MAINTENANCE_COOKIE,
  getMaintenanceBypassSecret,
  isMaintenanceEnabled,
  isMaintenanceExemptPath,
  shouldForceMaintenanceOnLocalhost,
} from "@/lib/maintenance";

const WEBHOOK_PREFIXES = ["/api/sumup/webhook", "/api/viva/webhook"];

/** Catégories matériel non prêtes — ne pas exposer via /boutique?category= */
const HIDDEN_BOUTIQUE_CATEGORIES = new Set([
  "cigarettes-electroniques",
  "pods",
  "resistances",
  "accessoires",
  "diy",
  "accus",
  "chargeurs",
  "drip-tips",
  "promotions",
  "nouveautes",
]);

function isLocalHost(host: string): boolean {
  const h = host.split(":")[0].toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

/** Sous-domaine inventaire employés (pas www / apex). */
function isInventaireHost(host: string): boolean {
  const h = host.split(":")[0].toLowerCase();
  return h === "inventaire.allvaps.fr";
}

function getJwtSecretKey(): Uint8Array | null {
  const secret = (process.env.JWT_SECRET || "").trim();
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

/** Propriétaire : cookie bypass OU session ADMIN. */
async function hasOwnerAccess(request: NextRequest): Promise<boolean> {
  const bypassSecret = getMaintenanceBypassSecret();
  if (bypassSecret && request.cookies.get(MAINTENANCE_COOKIE)?.value === bypassSecret) {
    return true;
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const key = getJwtSecretKey();
  if (!token || !key) return false;

  try {
    const { payload } = await jwtVerify(token, key);
    return payload.role === "ADMIN";
  } catch {
    return false;
  }
}

function applySecurityHeaders(
  response: NextResponse,
  pathname: string,
  opts?: { localDev?: boolean; requestId?: string }
): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (opts?.requestId) {
    response.headers.set(REQUEST_ID_HEADER, opts.requestId);
  }
  // Site public : AVA (HolographicAssistant) a besoin du micro.
  // Inventaire : caméra uniquement — microphone=() conservé.
  response.headers.set("Permissions-Policy", permissionsPolicyForPath(pathname));

  // En local : autoriser le Simple Browser / preview IDE (sinon page blanche iframe).
  // En prod : refuser tout embedding.
  const frameAncestors = opts?.localDev ? "*" : "'none'";
  if (!opts?.localDev) {
    response.headers.set("X-Frame-Options", "DENY");
  } else {
    response.headers.delete("X-Frame-Options");
  }

  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      // blob: requis pour textures GLB (GLTFLoader → ObjectURL) et workers Three.js
      "connect-src 'self' https: blob:",
      "worker-src 'self' blob:",
      // mediastream: requis pour getUserMedia (micro A.V.A.)
      "media-src 'self' blob: data: mediastream:",
      `frame-ancestors ${frameAncestors}`,
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ")
  );

  if (
    pathname.startsWith("/admin/fidelatoo") ||
    pathname.startsWith("/api/admin/fidelatoo") ||
    pathname.startsWith("/admin/ava") ||
    pathname.startsWith("/api/admin/ava")
  ) {
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return response;
}

/** Security headers + CSRF Origin + mode maintenance. */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();
  const host = request.headers.get("host") || "";
  const localDev = isLocalHost(host);
  const requestId = resolveRequestId(request);
  const hdr = { localDev, requestId };

  // inventaire.allvaps.fr/ → inventaire (sans toucher www/apex)
  if (isInventaireHost(host) && (pathname === "/" || pathname === "")) {
    const url = request.nextUrl.clone();
    url.pathname = "/inventaire";
    return applySecurityHeaders(NextResponse.rewrite(url), "/inventaire", hdr);
  }

  // Contournement propriétaire : /?mt_bypass=SECRET → cookie 30 jours
  const bypassSecret = getMaintenanceBypassSecret();
  const bypassParam = request.nextUrl.searchParams.get("mt_bypass");
  if (bypassSecret && bypassParam && bypassParam === bypassSecret) {
    const clean = request.nextUrl.clone();
    clean.searchParams.delete("mt_bypass");
    if (clean.pathname === "/maintenance") clean.pathname = "/";
    const res = NextResponse.redirect(clean);
    res.cookies.set(MAINTENANCE_COOKIE, bypassSecret, {
      httpOnly: true,
      sameSite: "lax",
      // Tunnel HTTPS : x-forwarded-proto=https même si NODE_ENV=development
      secure:
        request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https" ||
        process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return applySecurityHeaders(res, pathname, hdr);
  }

  const ownerAccess = await hasOwnerAccess(request);

  // /boutique?category=resistances (etc.) → page d'attente (fiable avant le rendu page)
  if (pathname === "/boutique") {
    const category = (request.nextUrl.searchParams.get("category") || "").toLowerCase();
    if (category && HIDDEN_BOUTIQUE_CATEGORIES.has(category)) {
      const url = request.nextUrl.clone();
      url.pathname = "/catalogue-en-preparation";
      url.search = "";
      return applySecurityHeaders(NextResponse.redirect(url), pathname, hdr);
    }
  }

  const maintenanceOn =
    isMaintenanceEnabled() &&
    !ownerAccess &&
    (shouldForceMaintenanceOnLocalhost() || !isLocalHost(host));

  if (maintenanceOn && !isMaintenanceExemptPath(pathname)) {
    if (pathname.startsWith("/api/")) {
      return applySecurityHeaders(
        NextResponse.json(
          {
            error: "maintenance",
            message: "Site en maintenance. Réessayez plus tard.",
          },
          { status: 503, headers: { "Retry-After": "3600" } }
        ),
        pathname,
        hdr
      );
    }

    const url = request.nextUrl.clone();
    // Public : uniquement les adresses boutiques pendant la maintenance
    url.pathname = "/boutiques";
    url.search = "";
    const res = NextResponse.redirect(url);
    res.headers.set("Retry-After", "3600");
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return applySecurityHeaders(res, pathname, hdr);
  }

  if (
    ["POST", "PUT", "PATCH", "DELETE"].includes(method) &&
    pathname.startsWith("/api/") &&
    !WEBHOOK_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    const origin = request.headers.get("origin");
    if (origin && !isAllowedOrigin(origin, host)) {
      emitOpsEvent({
        event: "SUSPICIOUS_REQUEST",
        category: "security",
        severity: "warning",
        route: pathname,
        requestId,
        metadata: { reason: "csrf_origin" },
      });
      return applySecurityHeaders(
        NextResponse.json({ error: "Origine non autorisée" }, { status: 403 }),
        pathname,
        hdr
      );
    }
  }

  return applySecurityHeaders(NextResponse.next(), pathname, hdr);
}

export const config = {
  matcher: [
    "/((?!_next/|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.[\\w]+$).*)",
  ],
};
