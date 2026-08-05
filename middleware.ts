import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { isAllowedOrigin } from "@/lib/security";
import {
  AUTH_COOKIE_NAME,
  MAINTENANCE_COOKIE,
  getMaintenanceBypassSecret,
  isMaintenanceEnabled,
  isMaintenanceExemptPath,
  shouldForceMaintenanceOnLocalhost,
} from "@/lib/maintenance";

const WEBHOOK_PREFIXES = ["/api/sumup/webhook", "/api/viva/webhook"];

function isLocalHost(host: string): boolean {
  const h = host.split(":")[0].toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
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

function applySecurityHeaders(response: NextResponse, pathname: string): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  const camera =
    pathname.startsWith("/inventaire") || pathname.startsWith("/admin/inventaire")
      ? "camera=(self)"
      : "camera=()";
  response.headers.set(
    "Permissions-Policy",
    `${camera}, microphone=(), geolocation=()`
  );
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: mediastream:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ")
  );
  return response;
}

/** Security headers + CSRF Origin + mode maintenance. */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();
  const host = request.headers.get("host") || "";

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
    return applySecurityHeaders(res, pathname);
  }

  const ownerAccess = await hasOwnerAccess(request);

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
        pathname
      );
    }

    const url = request.nextUrl.clone();
    // Public : uniquement les adresses boutiques pendant la maintenance
    url.pathname = "/boutiques";
    url.search = "";
    const res = NextResponse.redirect(url);
    res.headers.set("Retry-After", "3600");
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return applySecurityHeaders(res, pathname);
  }

  if (
    ["POST", "PUT", "PATCH", "DELETE"].includes(method) &&
    pathname.startsWith("/api/") &&
    !WEBHOOK_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    const origin = request.headers.get("origin");
    if (origin && !isAllowedOrigin(origin, host)) {
      return applySecurityHeaders(
        NextResponse.json({ error: "Origine non autorisée" }, { status: 403 }),
        pathname
      );
    }
  }

  return applySecurityHeaders(NextResponse.next(), pathname);
}

export const config = {
  matcher: [
    "/((?!_next/|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.[\\w]+$).*)",
  ],
};
