import { NextRequest } from "next/server";
import { z } from "zod";
import { registerUser } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/security";

const registerSchema = z
  .object({
    email: z.string().email().max(254),
    password: z
      .string()
      .min(8)
      .max(128)
      .regex(/[A-Za-z]/, "Le mot de passe doit contenir une lettre")
      .regex(/[0-9]/, "Le mot de passe doit contenir un chiffre"),
    passwordConfirm: z.string().min(8).max(128),
    firstName: z.string().min(1).max(80),
    lastName: z.string().min(1).max(80),
    phone: z.string().min(6).max(30),
    adultConfirmed: z.literal(true),
    acceptTerms: z.literal(true),
    acceptPrivacy: z.literal(true),
    newsletter: z.boolean().optional().default(false),
  })
  .refine((d) => d.password === d.passwordConfirm, {
    message: "Les mots de passe ne correspondent pas",
    path: ["passwordConfirm"],
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

    // newsletter: accepté côté API mais non auto-inscrit sans module dédié
    void data.newsletter;

    const result = await registerUser({
      email: data.email,
      password: data.password,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
    });

    return jsonResponse(result, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
