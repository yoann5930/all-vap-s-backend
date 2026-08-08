import { NextRequest } from "next/server";
import { z } from "zod";
import { registerUser } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/security";

const registerSchema = z
  .object({
    email: z
      .string({ required_error: "Veuillez renseigner une adresse email valide." })
      .email("Veuillez renseigner une adresse email valide.")
      .max(254),
    password: z
      .string({ required_error: "Veuillez renseigner un mot de passe." })
      .min(8, "Le mot de passe doit contenir au moins 8 caractères.")
      .max(128)
      .regex(/[A-Za-z]/, "Le mot de passe doit contenir une lettre.")
      .regex(/[0-9]/, "Le mot de passe doit contenir un chiffre."),
    passwordConfirm: z
      .string({ required_error: "Veuillez confirmer votre mot de passe." })
      .min(1, "Veuillez confirmer votre mot de passe.")
      .max(128),
    firstName: z
      .string({ required_error: "Veuillez renseigner votre prénom." })
      .min(1, "Veuillez renseigner votre prénom.")
      .max(80),
    lastName: z
      .string({ required_error: "Veuillez renseigner votre nom." })
      .min(1, "Veuillez renseigner votre nom.")
      .max(80),
    phone: z
      .string({ required_error: "Veuillez renseigner votre numéro de téléphone." })
      .min(6, "Veuillez renseigner votre numéro de téléphone.")
      .max(30),
    adultConfirmed: z.literal(true, {
      errorMap: () => ({
        message: "Vous devez confirmer être majeur(e) pour créer un compte.",
      }),
    }),
    acceptTerms: z.literal(true, {
      errorMap: () => ({
        message: "Vous devez accepter les Conditions Générales d’Utilisation.",
      }),
    }),
    acceptPrivacy: z.literal(true, {
      errorMap: () => ({
        message: "Vous devez accepter la politique de confidentialité.",
      }),
    }),
    newsletter: z.boolean().optional().default(false),
  })
  .refine((d) => d.password === d.passwordConfirm, {
    message: "Les mots de passe ne correspondent pas.",
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
