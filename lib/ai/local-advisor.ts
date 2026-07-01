import type { AIRequest, AIResponse } from "@/lib/ai";
import prisma from "@/lib/prisma";
import { getVapeProfile, upsertVapeProfile, addRecommendation } from "@/lib/vape-profile/service";
import { extractProfileUpdates, mergeProfileUpdates } from "@/lib/vape-profile/learning";
import { emptyVapeProfile, MEDICAL_DISCLAIMER } from "@/lib/vape-profile/types";
import {
  buildGreetingMessage,
  getPersonalizedRecommendations,
} from "@/lib/recommendations/engine";

export async function localVapeAdvisorChat(request: AIRequest): Promise<AIResponse> {
  const userMessage = request.messages.filter((m) => m.role === "user").pop()?.content ?? "";
  const userId = request.userId;

  if (!userId) {
    return {
      service: request.service,
      content:
        "Connectez-vous pour que l'Assistant All Vap's mémorise vos préférences et personnalise ses conseils. " +
        MEDICAL_DISCLAIMER,
      suggestions: ["Se connecter", "Voir la boutique"],
    };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const existing = (await getVapeProfile(userId)) ?? emptyVapeProfile();
  const updates = extractProfileUpdates(userMessage);

  if (Object.keys(updates).length > 0 && existing.gdprConsent) {
    const merged = mergeProfileUpdates(existing, updates);
    await upsertVapeProfile(userId, merged);
  }

  const profile = (await getVapeProfile(userId)) ?? existing;
  const products = await prisma.product.findMany({ where: { isActive: true, stock: { gt: 0 } } });
  const productList = products.map((p) => ({
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
  }));

  const recommendations = profile.gdprConsent && profile.personalizedEnabled
    ? getPersonalizedRecommendations(productList, profile, { limit: 3 })
    : [];

  const newRec = profile.gdprConsent
    ? getPersonalizedRecommendations(productList, profile, { limit: 1, newOnly: true })[0]
    : undefined;

  let content: string;

  if (!profile.gdprConsent) {
    content =
      "Pour personnaliser mes conseils, activez votre Profil vape dans Mon compte et acceptez la conservation de vos préférences. " +
      "En attendant, décrivez-moi vos goûts (fruité, frais, gourmand…) et votre matériel. " +
      MEDICAL_DISCLAIMER;
  } else if (request.service === "eliquid-recommender") {
    const greeting = buildGreetingMessage(profile, user?.firstName, newRec);
    const picks = recommendations.length
      ? ` Voici quelques suggestions : ${recommendations.map((r) => r.product.name).join(", ")}.`
      : " Parcourez notre catalogue e-liquides pour découvrir d'autres saveurs.";
    content = greeting + picks + " " + MEDICAL_DISCLAIMER;
  } else {
    const greeting = buildGreetingMessage(profile, user?.firstName, newRec);
    content = greeting + " " + MEDICAL_DISCLAIMER;
  }

  if (recommendations[0] && profile.gdprConsent) {
    await addRecommendation(userId, recommendations[0].product.id, recommendations[0].reason, recommendations[0].score, "assistant");
  }

  return {
    service: request.service,
    content,
    suggestions: recommendations.length
      ? recommendations.map((r) => r.product.name)
      : ["Profil vape", "Voir la boutique", "Nous contacter"],
  };
}
