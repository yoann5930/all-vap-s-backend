import { NextRequest } from "next/server";
import { z } from "zod";
import { loginUser } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/security";

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const ip = clientIp(request);
    const ipLimit = checkRateLimit(`login:ip:${ip}`, 20, 15 * 60 * 1000);
    if (!ipLimit.ok) {
      return jsonResponse(
        { error: "Trop de tentatives. Réessayez plus tard.", retryAfterSec: ipLimit.retryAfterSec },
        429
      );
    }

    const body = await request.json();
    // Trim avant validation — collages téléphone / espaces invisibles
    const data = loginSchema.parse({
      email: typeof body?.email === "string" ? body.email.trim().toLowerCase() : body?.email,
      password: typeof body?.password === "string" ? body.password.trim() : body?.password,
    });

    const emailLimit = checkRateLimit(
      `login:email:${data.email}`,
      8,
      15 * 60 * 1000
    );
    if (!emailLimit.ok) {
      return jsonResponse(
        { error: "Trop de tentatives. Réessayez plus tard.", retryAfterSec: emailLimit.retryAfterSec },
        429
      );
    }

    const result = await loginUser(data.email, data.password);
    return jsonResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}
