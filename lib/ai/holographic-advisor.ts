import prisma from "@/lib/prisma";
import { getVapeProfile, upsertVapeProfile, addRecommendation } from "@/lib/vape-profile/service";
import { mergeProfileUpdates } from "@/lib/vape-profile/learning";
import { emptyVapeProfile, MEDICAL_DISCLAIMER } from "@/lib/vape-profile/types";
import { getPersonalizedRecommendations } from "@/lib/recommendations/engine";
import {
  AGE_REFUSAL,
  SALES_STEPS,
  buildCompletionMessage,
  getStepQuestion,
  inferResumeStep,
  isAgeConfirmed,
  parseStepAnswer,
  returningVisitorGreeting,
} from "@/lib/ai/sales-script";

export interface AssistantInit {
  step: number;
  message: string;
  suggestions: string[];
  isLoggedIn: boolean;
  hasProfile: boolean;
  userName: string | null;
}

export interface AssistantReply {
  content: string;
  step: number;
  suggestions: string[];
  products?: Array<{ name: string; slug: string; reason: string }>;
  blocked?: boolean;
  isComplete?: boolean;
}

export async function initHolographicAssistant(userId?: string): Promise<AssistantInit> {
  if (!userId) {
    const step0 = SALES_STEPS[0];
    return {
      step: 0,
      message: step0.question + " Connectez-vous pour mémoriser vos préférences.",
      suggestions: [...step0.suggestions],
      isLoggedIn: false,
      hasProfile: false,
      userName: null,
    };
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true } });
  const profile = (await getVapeProfile(userId)) ?? emptyVapeProfile();

  if (profile.gdprConsent && profile.preferredFlavors.length > 0) {
    const products = await loadProducts();
    const newRecs = getPersonalizedRecommendations(products, profile, { limit: 1, newOnly: true });
    return {
      step: 6,
      message: returningVisitorGreeting(user?.firstName ?? null, newRecs.length > 0),
      suggestions: ["Voir les nouveautés", "Mettre à jour mes goûts", "Recommencer le questionnaire"],
      isLoggedIn: true,
      hasProfile: true,
      userName: user?.firstName ?? null,
    };
  }

  const step = inferResumeStep(profile);
  const stepData = getStepQuestion(step) ?? SALES_STEPS[0];
  const greeting = user?.firstName ? `${user.firstName}, ` : "";

  return {
    step,
    message: `${greeting}${stepData.question}`,
    suggestions: [...stepData.suggestions],
    isLoggedIn: true,
    hasProfile: profile.gdprConsent,
    userName: user?.firstName ?? null,
  };
}

async function loadProducts() {
  const rows = await prisma.product.findMany({ where: { isActive: true, stock: { gt: 0 } } });
  return rows.map((p) => ({
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
}

export async function chatHolographicAssistant(
  userId: string | undefined,
  step: number,
  message: string
): Promise<AssistantReply> {
  if (step === 0) {
    const confirmed = isAgeConfirmed(message);
    if (confirmed === false) {
      return {
        content: AGE_REFUSAL,
        step: 0,
        suggestions: [],
        blocked: true,
      };
    }
    if (confirmed === null) {
      return {
        content: "Merci de confirmer : avez-vous 18 ans ou plus ? " + MEDICAL_DISCLAIMER,
        step: 0,
        suggestions: ["Oui, j'ai 18 ans ou plus", "Non"],
      };
    }

    if (userId) {
      const existing = (await getVapeProfile(userId)) ?? emptyVapeProfile();
      await upsertVapeProfile(userId, { ...existing, gdprConsent: true, personalizedEnabled: true });
    }

    const next = SALES_STEPS[1];
    return {
      content: next.question,
      step: 1,
      suggestions: [...next.suggestions],
    };
  }

  if (step >= 6) {
    if (/nouveaut/i.test(message.toLowerCase()) && userId) {
      const profile = (await getVapeProfile(userId)) ?? emptyVapeProfile();
      const products = await loadProducts();
      const recs = getPersonalizedRecommendations(products, profile, { limit: 3, newOnly: true });
      if (recs.length === 0) {
        return {
          content: "Pas de nouveauté spécifique pour votre profil pour l'instant — explorez notre section nouveautés ! " + MEDICAL_DISCLAIMER,
          step: 6,
          suggestions: ["Voir la boutique", "Mettre à jour mes goûts"],
        };
      }
      for (const r of recs) {
        await addRecommendation(userId, r.product.id, r.reason, r.score, "holographic-assistant");
      }
      return {
        content: `Voici des nouveautés pour vous : ${recs.map((r) => r.product.name).join(", ")}. ${MEDICAL_DISCLAIMER}`,
        step: 6,
        suggestions: recs.map((r) => r.product.name),
        products: recs.map((r) => ({ name: r.product.name, slug: r.product.slug, reason: r.reason })),
        isComplete: true,
      };
    }

    if (/recommenc|reset|mettre à jour/i.test(message.toLowerCase())) {
      const next = SALES_STEPS[1];
      return { content: next.question, step: 1, suggestions: [...next.suggestions] };
    }

    return {
      content: "Posez-moi vos questions sur le matériel, les e-liquides ou la nicotine. " + MEDICAL_DISCLAIMER,
      step: 6,
      suggestions: ["Voir les nouveautés", "Voir la boutique", "Nos magasins"],
    };
  }

  const parsed = parseStepAnswer(step, message);
  let profile = userId ? (await getVapeProfile(userId)) ?? emptyVapeProfile() : emptyVapeProfile();

  if (userId) {
    const { material, priority, ...profileUpdates } = parsed;
    void material;
    void priority;
    profile = mergeProfileUpdates(profile, profileUpdates);
    if (step === 0 || profile.gdprConsent) {
      await upsertVapeProfile(userId, { ...profile, gdprConsent: true, personalizedEnabled: true });
    }
  }

  const nextStep = step + 1;

  if (nextStep >= SALES_STEPS.length) {
    const products = await loadProducts();
    const recs = userId && profile.gdprConsent
      ? getPersonalizedRecommendations(products, profile, { limit: 3 })
      : products.slice(0, 3).map((p) => ({
          product: p,
          score: 1,
          reason: "sélection All Vap's",
        }));

    if (userId) {
      for (const r of recs.slice(0, 3)) {
        await addRecommendation(userId, r.product.id, r.reason, r.score, "holographic-assistant");
      }
    }

    const content = buildCompletionMessage(profile, recs.map((r) => r.product.name));

    return {
      content,
      step: 6,
      suggestions: recs.map((r) => r.product.name).concat(["Voir la boutique"]),
      products: recs.map((r) => ({
        name: r.product.name,
        slug: r.product.slug,
        reason: r.reason,
      })),
      isComplete: true,
    };
  }

  const next = SALES_STEPS[nextStep];
  return {
    content: next.question,
    step: nextStep,
    suggestions: [...next.suggestions],
  };
}
