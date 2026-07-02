import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Security headers only — never redirect, never touch static assets.
 * Static exclusions must stay in sync with vercel.json redirect rules.
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
  matcher: [
    /*
     * Run only on HTML/app routes — skip all static assets:
     * _next/*, public files, SEO files, any path with a file extension
     */
    "/((?!_next/|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.[\\w]+$).*)",
  ],
};
