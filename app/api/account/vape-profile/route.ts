import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import {
  deleteVapeProfile,
  getProfileWithContext,
  upsertVapeProfile,
} from "@/lib/vape-profile/service";
import { MEDICAL_DISCLAIMER } from "@/lib/vape-profile/types";

const profileSchema = z.object({
  status: z.enum(["debutant", "confirme"]).optional(),
  cigarettesPerDay: z.number().int().min(0).max(100).nullable().optional(),
  drawPreference: z.enum(["serre", "aerien", "mixte"]).nullable().optional(),
  preferredFlavors: z.array(z.enum(["fruite", "frais", "gourmand", "classic", "boisson"])).optional(),
  avoidedFlavors: z.array(z.enum(["fruite", "frais", "gourmand", "classic", "boisson"])).optional(),
  advisedNicotineMg: z.number().int().min(0).max(20).nullable().optional(),
  usedNicotineMg: z.number().int().min(0).max(20).nullable().optional(),
  triedProductIds: z.array(z.string()).optional(),
  averageBudgetCents: z.number().int().min(0).nullable().optional(),
  gdprConsent: z.boolean().optional(),
  personalizedEnabled: z.boolean().optional(),
});

export async function GET() {
  try {
    const auth = await requireAuth();
    const data = await getProfileWithContext(auth.userId);
    return jsonResponse({ ...data, disclaimer: MEDICAL_DISCLAIMER });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth();
    const body = profileSchema.parse(await request.json());

    if (body.gdprConsent !== true) {
      const existing = await getProfileWithContext(auth.userId);
      if (!existing.hasProfile) {
        return jsonResponse({ error: "Consentement RGPD requis pour enregistrer vos préférences." }, 400);
      }
    }

    const profile = await upsertVapeProfile(auth.userId, body);
    return jsonResponse({ profile, disclaimer: MEDICAL_DISCLAIMER });
  } catch (error) {
    if (error instanceof Error && error.message === "GDPR_CONSENT_REQUIRED") {
      return jsonResponse({ error: "Consentement RGPD requis." }, 400);
    }
    return handleApiError(error);
  }
}

export async function DELETE() {
  try {
    const auth = await requireAuth();
    await deleteVapeProfile(auth.userId);
    return jsonResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth();
    const { personalizedEnabled } = z.object({ personalizedEnabled: z.boolean() }).parse(await request.json());
    const profile = await upsertVapeProfile(auth.userId, { personalizedEnabled });
    return jsonResponse(profile);
  } catch (error) {
    return handleApiError(error);
  }
}
