import { NextRequest } from "next/server";
import { z } from "zod";
import { askAI } from "@/lib/ai";
import { jsonResponse, handleApiError } from "@/lib/api-utils";

const schema = z.object({
  service: z.enum(["vape-advisor", "eliquid-recommender", "pokemon-estimator"]),
  message: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = schema.parse(await request.json());
    let userId: string | undefined;
    try {
      const { getAuthUser } = await import("@/lib/jwt");
      const auth = await getAuthUser();
      userId = auth?.userId;
    } catch {
      // optional auth
    }

    const response = await askAI({
      service: body.service,
      messages: [{ role: "user", content: body.message }],
      userId,
    });

    if (userId && body.service !== "pokemon-estimator") {
      try {
        const { extractProfileUpdates, mergeProfileUpdates } = await import("@/lib/vape-profile/learning");
        const { getVapeProfile, upsertVapeProfile } = await import("@/lib/vape-profile/service");
        const { emptyVapeProfile } = await import("@/lib/vape-profile/types");
        const profile = (await getVapeProfile(userId)) ?? emptyVapeProfile();
        if (profile.gdprConsent) {
          const updates = extractProfileUpdates(body.message);
          if (Object.keys(updates).length > 0) {
            await upsertVapeProfile(userId, mergeProfileUpdates(profile, updates));
          }
        }
      } catch {
        // non-blocking
      }
    }

    return jsonResponse(response);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET() {
  const { AI_SERVICES } = await import("@/lib/ai");
  return jsonResponse(AI_SERVICES);
}
