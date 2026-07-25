import { NextRequest } from "next/server";
import { z } from "zod";
import { registerUser } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/security";

const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Za-z]/, "Le mot de passe doit contenir une lettre")
    .regex(/[0-9]/, "Le mot de passe doit contenir un chiffre"),
  firstName: z.string().max(80).optional(),
  lastName: z.string().max(80).optional(),
});

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const ip = clientIp(request);
    const limit = checkRateLimit(`register:ip:${ip}`, 10, 60 * 60 * 1000);
    if (!limit.ok) {
      return jsonResponse(
        { error: "Trop d'inscriptions. Réessayez plus tard.", retryAfterSec: limit.retryAfterSec },
        429
      );
    }

    const body = await request.json();
    const data = registerSchema.parse(body);
    const result = await registerUser(data);
    return jsonResponse(result, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
