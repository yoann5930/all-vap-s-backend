import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { loginUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/security";
import { COOKIE_NAME } from "@/lib/jwt";

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

    // loginUser pose aussi les cookies via next/headers — on les re-pose sur la Response
    // pour garantir Set-Cookie sur inventaire.allvaps.fr (sinon bounce login → inventaire → login).
    const result = await loginUser(data.email, data.password);
    const secure = cookieSecure(request);
    const response = NextResponse.json(result);

    response.cookies.set(COOKIE_NAME, result.token, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 2,
    });

    // Refresh déjà émis côté loginUser (cookie store) ; s’il est présent dans le jar, OK.
    // On ne régénère pas ici pour éviter deux refresh tokens.

    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
