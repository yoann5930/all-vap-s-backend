import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { loginUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/security";
import {
  COOKIE_NAME,
  REFRESH_COOKIE,
  accessCookieOptions,
  refreshCookieOptions,
} from "@/lib/jwt";

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
  totpToken: z.string().min(6).max(12).optional(),
});

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
    const ip = clientIp(request);
    const ipLimit = checkRateLimit(`login:ip:${ip}`, 20, 15 * 60 * 1000);
    if (!ipLimit.ok) {
      return NextResponse.json(
        { error: "Trop de tentatives. Réessayez plus tard.", retryAfterSec: ipLimit.retryAfterSec },
        { status: 429 }
      );
    }

    const body = await request.json();
    const data = loginSchema.parse({
      email: typeof body?.email === "string" ? body.email.trim().toLowerCase() : body?.email,
      password: typeof body?.password === "string" ? body.password.trim() : body?.password,
      totpToken: body?.totpToken,
    });

    const emailLimit = checkRateLimit(`login:email:${data.email}`, 8, 15 * 60 * 1000);
    if (!emailLimit.ok) {
      return NextResponse.json(
        { error: "Trop de tentatives. Réessayez plus tard.", retryAfterSec: emailLimit.retryAfterSec },
        { status: 429 }
      );
    }

    // Cookies uniquement sur NextResponse (Set-Cookie garanti sur inventaire.allvaps.fr / mobile).
    const result = await loginUser(data.email, data.password, { setCookies: false });
    const secure = cookieSecure(request);
    const response = NextResponse.json({
      user: result.user,
      token: result.token,
    });

    response.cookies.set(COOKIE_NAME, result.token, accessCookieOptions(secure));
    if (result.refreshToken) {
      response.cookies.set(
        REFRESH_COOKIE,
        result.refreshToken,
        refreshCookieOptions(secure)
      );
    }

    response.headers.set("Cache-Control", "no-store, private");
    response.headers.set("Pragma", "no-cache");
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
