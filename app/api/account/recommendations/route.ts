import { requireAuth } from "@/lib/jwt";
import prisma from "@/lib/prisma";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { getVapeProfile, addRecommendation } from "@/lib/vape-profile/service";
import { getPersonalizedRecommendations } from "@/lib/recommendations/engine";
import { MEDICAL_DISCLAIMER } from "@/lib/vape-profile/types";

export async function GET() {
  try {
    const auth = await requireAuth();
    const profile = await getVapeProfile(auth.userId);

    if (!profile?.gdprConsent || !profile.personalizedEnabled) {
      return jsonResponse({ recommendations: [], greeting: null, disclaimer: MEDICAL_DISCLAIMER });
    }

    const products = await prisma.product.findMany({
      where: { isActive: true, stock: { gt: 0 } },
    });

    const scored = getPersonalizedRecommendations(
      products.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        category: p.category,
        brand: p.brand,
        priceCents: p.priceCents,
        promoPriceCents: p.promoPriceCents,
        isPromo: p.isPromo,
        isNew: p.isNew,
        stock: p.stock,
      })),
      profile,
      { limit: 6 }
    );

    const newScored = getPersonalizedRecommendations(
      products.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        category: p.category,
        brand: p.brand,
        priceCents: p.priceCents,
        promoPriceCents: p.promoPriceCents,
        isPromo: p.isPromo,
        isNew: p.isNew,
        stock: p.stock,
      })),
      profile,
      { limit: 1, newOnly: true }
    );

    for (const s of scored.slice(0, 3)) {
      await addRecommendation(auth.userId, s.product.id, s.reason, s.score, "engine");
    }

    const user = await prisma.user.findUnique({ where: { id: auth.userId } });
    const { buildGreetingMessage } = await import("@/lib/recommendations/engine");
    const greeting = buildGreetingMessage(profile, user?.firstName, newScored[0] ?? null);

    return jsonResponse({
      recommendations: scored,
      newForYou: newScored,
      greeting,
      disclaimer: MEDICAL_DISCLAIMER,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
