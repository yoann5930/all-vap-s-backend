import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Security headers only — no host or HTTPS redirects here.
 * Vercel handles HTTP→HTTPS and www→apex at the edge (see vercel.json).
 * Redirect logic in middleware caused ERR_TOO_MANY_REDIRECTS on custom domains
 * because x-forwarded-proto can be "http" on internal requests even over HTTPS.
 */
export function middleware(_request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
