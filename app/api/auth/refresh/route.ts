import { NextRequest, NextResponse } from "next/server";
import { refreshAccessToken, COOKIE_NAME, accessCookieOptions } from "@/lib/jwt";
import { handleApiError } from "@/lib/api-utils";
import { assertSameOrigin } from "@/lib/security";

function cookieSecure(request: NextRequest): boolean {
  const xf = (request.headers.get("x-forwarded-proto") || "").split(",")[0].trim().toLowerCase();
  if (xf === "https") return true;
  if (xf === "http") return false;
  const host = (request.headers.get("host") || "").toLowerCase();
  if (host.includes("localhost") || host.startsWith("127.0.0.1")) return false;
  return process.env.NODE_ENV === "production";
}

/** Renouvelle l’access JWT via cookie refresh httpOnly. */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const result = await refreshAccessToken();
    if (!result) {
      throw new Error("UNAUTHORIZED");
    }
    const secure = cookieSecure(request);
    const response = NextResponse.json({
      token: result.token,
      user: {
        id: result.user.userId,
        email: result.user.email,
        role: result.user.role,
      },
    });
    response.cookies.set(COOKIE_NAME, result.token, accessCookieOptions(secure));
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
