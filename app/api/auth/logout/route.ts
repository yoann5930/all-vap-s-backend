import { NextRequest, NextResponse } from "next/server";
import { logoutUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { assertSameOrigin } from "@/lib/security";
import {
  COOKIE_NAME,
  REFRESH_COOKIE,
  accessCookieOptions,
  refreshCookieOptions,
} from "@/lib/jwt";

function cookieSecure(request: NextRequest): boolean {
  const xf = (request.headers.get("x-forwarded-proto") || "").split(",")[0].trim().toLowerCase();
  if (xf === "https") return true;
  if (xf === "http") return false;
  const host = (request.headers.get("host") || "").toLowerCase();
  if (host.includes("localhost") || host.startsWith("127.0.0.1")) return false;
  return process.env.NODE_ENV === "production";
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    await logoutUser();
    const secure = cookieSecure(request);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(COOKIE_NAME, "", { ...accessCookieOptions(secure), maxAge: 0 });
    response.cookies.set(REFRESH_COOKIE, "", { ...refreshCookieOptions(secure), maxAge: 0 });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
