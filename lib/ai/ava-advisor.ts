import prisma from "@/lib/prisma";
import { stores, getStoreById, type Store } from "@/lib/stores";
import { formatStorePhone } from "@/lib/stores/nearest";
import { searchStoreByCityOrPostal } from "@/lib/stores/geocode-fr";
import type { PreferredStoreId } from "@/lib/stores/preferred-store";
import { getVapeProfile, upsertVapeProfile, addRecommendation } from "@/lib/vape-profile/service";
import { extractProfileUpdates, mergeProfileUpdates } from "@/lib/vape-profile/learning";
import { emptyVapeProfile } from "@/lib/vape-profile/types";
import { getPersonalizedRecommendations } from "@/lib/recommendations/engine";
import {
  type CatalogProduct,
} from "@/lib/ai/catalog-search";
import {
  loadCatalogForAva,
  mergeContextFromMessage,
  parseProductReference,
  searchProductsForAva,
  searchNearbyAlternatives,
  buildAvaProductAnswer,
  buildClarificationAnswer,
  buildOutOfStockAnswer,
  emptyConversationContext,
  type AvaConversationContext,
} from "@/lib/ai/ava";
import { AGE_REFUSAL } from "@/lib/ai/sales-script";
import {
  AVA_GREETING,
  AVA_SUGGESTIONS,
  AVA_NAME_REPLY,
} from "@/lib/ai/ava-constants";
import { parseCatalogSpecs } from "@/lib/ai/ava-speech-utils";
import {
  resolveExperienceLevel,
  parseCigarettesCorrection,
  detectNicotineFeedback,
  isPurchaseOrBeginnerCounsel,
  hasHardwareProblemSignal,
  shouldSkipBeginnerQuiz,
  logAdvisorDecision,
  isFlavorTooEarly,
  isNicotineStrengthQuestion,
  isAskToPickRecommended,
  isConfirmRecommendedDevice,
  parseCigarettesPerDay,
} from "@/lib/ava/advisor-policy";
import {
  memoryFromVapeProfile,
  applyCigarettesCorrection,
  toVapeProfilePatch,
  emptyCustomerMemory,
  type AvaCustomerMemory,
} from "@/lib/ava/customer-memory";
import { beginnerNicotineOrientation, speakNicotineFollowup } from "@/lib/ava/beginner-nicotine-speak";
import { presentDeviceGuide } from "@/lib/ava/device-guide-present";
import { selectBeginnerDevicePool } from "@/lib/ava/device-recommendation";

export { AVA_GREETING, AVA_SUGGESTIONS } from "@/lib/ai/ava-constants";

export type AvaChatOptions = {
  /** Boutique mémorisée côté client uniquement (jamais de GPS). */
  preferredStoreId?: PreferredStoreId | null;
  /** Mémoire de conversation temporaire (session client). */
  /** Lignes panier optionnelles — vérification offre Twenty avant paiement. */
  cartItems?: Array<{
    productId: string;
    variantId?: string | null;
    name?: string;
    quantity: number;
    priceCents?: number;
    category?: string | null;
    productType?: string | null;
    volumeMl?: number | null;
    promotion10mlEligible?: boolean | null;
    brand?: string | null;
    range?: string | null;
    rangeSlug?: string | null;
    productFamily?: string | null;
  }> | null;
};

export interface AvaProductCard {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  priceCents: number;
  promoPriceCents: number | null;
  isPromo: boolean;
  stock: number;
  description: string | null;
  reason: string;
  nicotine: string | null;
  pgVg: string | null;
  volume: string | null;
  variantId?: string | null;
}

export interface AvaReply {
  content: string;
  suggestions: string[];
  products: AvaProductCard[];
  blocked?: boolean;
  speaking?: boolean;
  conversationContext?: AvaConversationContext;
  /** Médiathèque pédagogique (cartes UI) — médias souvent encore DRAFT. */
  videoRecommendations?: Array<{
    id: string;
    title: string;
    shortTitle?: string;
    description: string;
    formatType: string;
    durationSeconds: number;
    safetyNotice: string;
    videoPath: string | null;
    thumbnailPath?: string | null;
    fallbackText: string;
    chapters?: { id: string; title: string; startSeconds: number }[];
    status: string;
    sourceStatus: string;
    mediaReady?: boolean;
    reason?: string;
    followUpQuestion?: string;
  }>;
  hardwareAssistance?: {
    phase: string;
    showMediaUploader: boolean;
    showDeviceConfirmation: boolean;
    photoButtons?: ReadonlyArray<{ id: string; label: string }>;
    candidates: Array<{
      manufacturer: string;
      model: string;
      modelSlug: string;
      imageUrl: string | null;
      distinguishingFeatures: string[];
    }>;
    deviceContext: unknown;
    diagnosticSession?: import("@/lib/ava/diagnostic-session").DiagnosticSession;
  };
  /** Guide matériel auto (notice vérifiée uniquement). */
  deviceGuide?: import("@/lib/ava/device-guide-present").AvaDeviceGuideView | null;
}

function toCard(p: CatalogProduct, reason: string): AvaProductCard {
  const specs = parseCatalogSpecs(`${p.name} ${p.description ?? ""}`);
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    imageUrl: p.imageUrl,
    priceCents: p.priceCents,
    promoPriceCents: p.promoPriceCents ?? null,
    isPromo: Boolean(p.isPromo),
    stock: p.stock,
    description: p.description,
    reason,
    nicotine: specs.nicotine,
    pgVg: specs.pgVg,
    volume: specs.volume,
    variantId: null,
  };
}

async function loadCatalog(): Promise<CatalogProduct[]> {
  const rows = await prisma.product.findMany({
    where: { isActive: true, visibleOnline: true },
  });
  const location = await prisma.stockLocation.findUnique({ where: { code: "GLOBAL_ALL_VAPS" } });
  const levels = location
    ? await prisma.stockLevel.findMany({
        where: { locationId: location.id },
        select: { productId: true, availableQuantity: true, quantity: true, reservedQuantity: true },
      })
    : [];
  const byProduct = new Map(levels.map((l) => [l.productId, l]));

  return rows.map((p) => {
    const level = byProduct.get(p.id);
    const availableQuantity = level ? level.availableQuantity : null;
    const stockKnown = Boolean(level);
    return {
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
      isBestSeller: p.isBestSeller,
      stock: stockKnown ? (availableQuantity ?? 0) : p.stock,
      imageUrl: p.imageUrl,
      isActive: p.isActive,
      availableQuantity,
      stockKnown,
    };
  });
}

function nearestStoreSentence(store: Store): string {
  const place =
    store.id === "le-quesnoy" ? "celle du Quesnoy" : "celle de Hautmont";
  return `La boutique All Vap's la plus proche de chez vous est ${place}. Vous pouvez la joindre au ${formatStorePhone(store.phone)}.`;
}

function storeDetailsBlock(store: Store): string {
  return `${store.name}\n${store.address}, ${store.postalCode} ${store.city}\n${formatStorePhone(store.phone)}\n\nHoraires :\n${store.hours.join("\n")}`;
}

async function storeInfo(
  text: string,
  preferredStoreId?: PreferredStoreId | null
): Promise<string | null> {
  const lower = text.toLowerCase();
  const asksStore =
    /boutique|magasin|horaire|adresse|où|ou trouver|contact|téléphone|telephone|proche|près de|pres de|itin[eé]raire/i.test(
      lower
    );
  if (!asksStore) return null;

  const named = stores.find(
    (s) =>
      lower.includes(s.city.toLowerCase()) ||
      lower.includes(s.id.replace("-", " ")) ||
      (s.id === "le-quesnoy" && /quesnoy/.test(lower)) ||
      (s.id === "hautmont" && /hautmont/.test(lower))
  );
  if (named) {
    return storeDetailsBlock(named);
  }

  // Ville / CP dans le message (sans stocker de GPS)
  const postalOrCity = text.match(/\b\d{5}\b/)?.[0] || text.trim();
  if (
    /\b\d{5}\b/.test(text) ||
    /ville|code\s*postal|j['’]habite|habite|pr[eè]s de|proche de/i.test(lower)
  ) {
    const found = await searchStoreByCityOrPostal(postalOrCity);
    if (found.ok) {
      const s = found.result.store;
      return `${nearestStoreSentence(s)}\n\n${storeDetailsBlock(s)}`;
    }
  }

  if (preferredStoreId) {
    const preferred = getStoreById(preferredStoreId);
    if (preferred) {
      return `${nearestStoreSentence(preferred)}\n\n${storeDetailsBlock(preferred)}\n\nL'autre boutique : ${
        preferred.id === "hautmont" ? "All Vap's Le Quesnoy" : "All Vap's Hautmont"
      }.`;
    }
  }

  return "Pouvez-vous m'indiquer votre ville ou votre code postal afin que je vous oriente vers la boutique la plus proche ?\n\nNos boutiques :\n" +
    stores
      .map((s) => `• ${s.name} — ${s.address}, ${s.city}\n  ${s.hours[0]} · ${formatStorePhone(s.phone)}`)
      .join("\n\n");
}

function loyaltyInfo(text: string): string | null {
  if (!/fid[ée]lit[ée]|points|qr|carte/i.test(text.toLowerCase())) return null;
  return "Programme fidélité All Vap's : cumulez des points à chaque achat. Consultez votre solde dans Mon compte → Fidélité.";
}

function isSavOrHardwareIntent(text: string): boolean {
  return isHardwareAssistanceMessage(text) || /sav|garantie|panne|r[ée]paration/i.test(text);
}

function savBoutiqueHint(): string {
  return "Je peux vous guider en diagnostic SAV étape par étape (sans facture pour démarrer). Décrivez le symptôme : fuite, Check Atomizer, goût brûlé, charge, allumage… Ou indiquez marque + modèle.";
}

function isHardwareAssistanceMessage(text: string): boolean {
  const t = text.toLowerCase();
  if (/(e-?liquide|saveur|fruit[ée]|promos?)\b/.test(t) && !/(résistance|pod|box|fuit|allume|vapeur|panne|sav)/.test(t)) {
    return false;
  }
  return /(pod|box|kit|vape|vapoteuse|cigarette|appareil|mat[ée]riel|fuit|glouglou|atomizer|atomiseur|r[ée]sistance|resistance|cartouche|ne s['']?allume|ne marche|go[uû]t de br[uû]l|chauffe|batterie|panne|sav|garantie|check\s*atomizer|no\s*atomizer|ecran|écran|charge|tirage)/i.test(
    t
  );
}

function isNameQuestion(text: string): boolean {
  return /(?:comment\s+(?:tu\s+t['’]appelle|vous\s+appelez)|quel\s+est\s+(?:ton|votre)\s+nom|t['’]appelle|qui\s+es[- ]tu|qui\s+[êe]tes[- ]vous)/i.test(
    text
  );
}

function productReply(
  intro: string,
  picks: CatalogProduct[],
  reason: string,
  suggestions: string[]
): AvaReply {
  const cards = picks.map((p) => toCard(p, reason));
  const availabilityNote =
    picks.length > 0
      ? picks.every((p) => (p.availableQuantity != null ? p.availableQuantity : p.stock) > 0)
        ? " Ces produits sont disponibles chez All Vap's."
        : ""
      : "";
  return {
    content: `${intro}${availabilityNote}`,
    suggestions: [...suggestions.slice(0, 3), "Autre recherche", "Nos magasins"],
    products: cards,
    speaking: true,
  };
}

export async function initAva(userId?: string) {
  let greeting = pickGuestGreeting();
  let suggestions = [...AVA_SUGGESTIONS];

  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    const profile = (await getVapeProfile(userId)) ?? emptyVapeProfile();
    const display =
      user?.firstName?.trim() ||
      (user?.lastName?.trim() ? `Monsieur ${user.lastName.trim()}` : null);

    if (display) {
      const returningBeginner =
        (profile.status === "debutant" || profile.status === "guide") &&
        (profile.advisedProductIds.length > 0 || profile.usedNicotineMg != null);
      greeting = pickNamedGreeting(display, returningBeginner);
    }

    if (profile.gdprConsent && profile.preferredFlavors.length > 0) {
      const products = await loadCatalog();
      const newRecs = getPersonalizedRecommendations(products, profile, { limit: 1, newOnly: true });
      if (newRecs.length > 0) {
        greeting += ` Une nouveauté pourrait vous plaire : ${newRecs[0].product.name}.`;
        suggestions = ["Voir la nouveauté", ...AVA_SUGGESTIONS.slice(0, 3)];
      }
    }
  }

  return {
    message: greeting,
    suggestions,
    isLoggedIn: Boolean(userId),
    agentName: "AVA",
  };
}

function pickGuestGreeting(): string {
  const list = [
    "Bonjour — Ava, All Vap's. Liquide, matériel, ou un souci à régler ?",
    "Bonjour ! Je suis Ava. Que recherchez-vous ?",
    "Bienvenue chez All Vap's. Je m'appelle Ava — dites-moi ce que vous cherchez.",
  ];
  return list[Math.floor(Math.random() * list.length)];
}

function pickNamedGreeting(name: string, returningBeginner?: boolean): string {
  if (returningBeginner) {
    return `Bonjour ${name}, contente de vous retrouver ! Comment ça se passe avec votre cigarette électronique ?`;
  }
  const list = [
    `Bonjour ${name}, comment allez-vous ? Qu'est-ce que vous recherchez aujourd'hui ?`,
    `Bonjour ${name} ! Ravie de vous revoir. Je peux vous aider à trouver quelque chose ?`,
    `Rebonjour ${name}. Que puis-je vous proposer aujourd'hui ?`,
    `Bonjour ${name}. Dites-moi ce dont vous avez envie, je regarde dans le catalogue.`,
  ];
  return list[Math.floor(Math.random() * list.length)];
}

export async function chatAva(
  userId: string | undefined,
  message: string,
  options?: AvaChatOptions
): Promise<AvaReply> {
  const text = message.toLowerCase();
  const prevCtxBase = options?.conversationContext ?? emptyConversationContext();
  let advisorMemory = emptyCustomerMemory({
    experienceLevel: prevCtxBase.experienceLevel ?? "BEGINNER",
    cigarettesPerDay: prevCtxBase.cigarettesPerDay ?? null,
    allDayNeed: prevCtxBase.allDayNeed ?? null,
  });
  if (userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true },
      });
      const profile = await getVapeProfile(userId);
      advisorMemory = memoryFromVapeProfile(profile, user?.firstName?.trim() || null);
      if (prevCtxBase.cigarettesPerDay != null) {
        advisorMemory.cigarettesPerDay = prevCtxBase.cigarettesPerDay;
      }
      if (prevCtxBase.allDayNeed != null) advisorMemory.allDayNeed = prevCtxBase.allDayNeed;
    } catch {
      /* mémoire optionnelle */
    }
  }
  advisorMemory.experienceLevel = resolveExperienceLevel({
    profileStatus:
      advisorMemory.experienceLevel === "EXPERT"
        ? "confirme"
        : advisorMemory.experienceLevel === "AUTONOMOUS"
          ? "autonome"
          : advisorMemory.experienceLevel === "GUIDED"
            ? "guide"
            : "debutant",
    message,
    previous: advisorMemory.experienceLevel,
  });

  // Âge : uniquement signal explicite (jamais une correction matériel / « Non, … »)
  {
    const { detectAgeIntent } = await import("@/lib/ai/ava/age-intent");
    if (detectAgeIntent(message) === "underage") {
      return { content: AGE_REFUSAL, suggestions: [], products: [], blocked: true };
    }
  }

  if (isNameQuestion(message)) {
    return {
      content: AVA_NAME_REPLY,
      suggestions: AVA_SUGGESTIONS,
      products: [],
      speaking: true,
    };
  }

  {
    const cigsCorr = parseCigarettesCorrection(message);
    const inFlow = Boolean(prevCtxBase.quickFlow?.flow);
    if (cigsCorr && !inFlow) {
      advisorMemory = applyCigarettesCorrection(advisorMemory, cigsCorr);
      if (userId) await persistAdvisorMemory(userId, advisorMemory);
      const nic =
        advisorMemory.experienceLevel === "EXPERT" || advisorMemory.experienceLevel === "AUTONOMOUS"
          ? { spoken: "" }
          : beginnerNicotineOrientation({
              cigarettesPerDay: cigsCorr,
              allDayNeed: advisorMemory.allDayNeed === true,
              deviceKind: "pod",
              hasSelectedDevice: Boolean(
                advisorMemory.selectedDeviceName || advisorMemory.currentDeviceName,
              ),
            });
      logAdvisorDecision({
        experienceLevel: advisorMemory.experienceLevel,
        intent: "MEMORY_UPDATE",
        missingRequiredFields: [],
        action: "UPDATE_MEMORY",
        nicotineEngine: nic.spoken ? "RECALCULATED" : "SKIPPED_EXPERT",
        memoryLoaded: Boolean(userId),
      });
      return {
        content: `D'accord, je retiens environ ${cigsCorr} cigarettes par jour.${
          nic.spoken ? ` ${nic.spoken}` : ""
        }`,
        suggestions: ["Voir le matériel", "Ça me convient", "Autre question"],
        products: [],
        speaking: true,
        conversationContext: {
          ...prevCtxBase,
          cigarettesPerDay: cigsCorr,
          experienceLevel: advisorMemory.experienceLevel,
          memoryLoaded: true,
          superseded: {
            ...prevCtxBase.superseded,
            cigarettesPerDay: [
              ...(prevCtxBase.superseded.cigarettesPerDay || []),
              String(advisorMemory.cigarettesPerDayPrevious ?? ""),
            ].filter(Boolean),
          },
        },
      };
    }
  }

  {
    const fb = detectNicotineFeedback(message);
    if (fb && !prevCtxBase.quickFlow?.flow && (advisorMemory.experienceLevel === "BEGINNER" || advisorMemory.experienceLevel === "GUIDED")) {
      const spoken = speakNicotineFollowup({
        feedback: fb,
        cigarettesPerDay: advisorMemory.cigarettesPerDay,
      });
      logAdvisorDecision({
        experienceLevel: advisorMemory.experienceLevel,
        intent: "NICOTINE_FEEDBACK",
        missingRequiredFields: [],
        action: "ORIENT_NICOTINE",
        nicotineEngine: "TABLE",
        memoryLoaded: Boolean(userId),
      });
      return {
        content: spoken,
        suggestions: ["Voir le matériel", "Changer de liquide", "Ça me convient"],
        products: [],
        speaking: true,
        conversationContext: {
          ...prevCtxBase,
          experienceLevel: advisorMemory.experienceLevel,
          cigarettesPerDay: advisorMemory.cigarettesPerDay,
          memoryLoaded: true,
        },
      };
    }
  }

  // Consigne explicite « Réponds uniquement : … » — avant tout catalogue / SAV
  {
    const { parseExplicitReplyInstruction } = await import(
      "@/lib/ava/admin-social/explicit-reply"
    );
    const explicit = parseExplicitReplyInstruction(message);
    if (explicit) {
      return {
        content: explicit,
        suggestions: [],
        products: [],
        speaking: true,
        conversationContext: options?.conversationContext ?? undefined,
      };
    }
  }

  // Social / small talk AVANT tout catalogue
  {
    const { detectClientIntent, socialReplyForIntent } = await import(
      "@/lib/ai/ava/client-intent-router"
    );
    const intent = detectClientIntent(message, options?.conversationContext ?? null);
    if (intent === "SOCIAL_GREETING" || intent === "SOCIAL_SMALLTALK") {
      const returning =
        Boolean(advisorMemory.firstName) &&
        (advisorMemory.experienceLevel === "BEGINNER" || advisorMemory.experienceLevel === "GUIDED") &&
        (Boolean(advisorMemory.selectedDeviceName || advisorMemory.currentDeviceName) ||
          advisorMemory.recommendedProductIds.length > 0 ||
          advisorMemory.usedNicotineMg != null);
      const named =
        advisorMemory.firstName && (returning || advisorMemory.recommendedProductIds.length > 0)
          ? pickNamedGreeting(advisorMemory.firstName, returning)
          : null;
      return {
        content: named || socialReplyForIntent(intent),
        suggestions: returning
          ? ["Ça se passe bien", "J'ai encore envie de fumer", "Autre question"]
          : ["Je cherche un liquide", "Conseil matériel", "Ça fuit"],
        products: [],
        speaking: true,
        conversationContext: {
          ...(options?.conversationContext ?? emptyConversationContext()),
          experienceLevel: advisorMemory.experienceLevel,
          cigarettesPerDay: advisorMemory.cigarettesPerDay,
          memoryLoaded: true,
        },
      };
    }
  }

  // Jamais orienter vers le budget — ignorer ces questions côté réponses Ava
  if (/quel\s+est\s+votre\s+budget|combien\s+(souhaitez|voulez)|gamme\s+de\s+prix|budget\s*\?/i.test(text)) {
    return {
      content:
        "Les prix sont affichés juste en dessous des produits. Dites-moi plutôt ce que vous cherchez.",
      suggestions: AVA_SUGGESTIONS,
      products: [],
      speaking: true,
    };
  }

  // Nicotine de départ : moteur métier, phrase boutique — avant l'orchestrateur / interview
  if (isNicotineStrengthQuestion(message)) {
    const cigs =
      advisorMemory.cigarettesPerDay ??
      prevCtxBase.cigarettesPerDay ??
      parseCigarettesPerDay(message);
    if (cigs) {
      const nic = beginnerNicotineOrientation({
        cigarettesPerDay: cigs,
        allDayNeed: advisorMemory.allDayNeed === true,
        deviceKind: "pod",
        hasSelectedDevice: Boolean(advisorMemory.selectedDeviceName || advisorMemory.currentDeviceName),
      });
      logAdvisorDecision({
        experienceLevel: advisorMemory.experienceLevel,
        intent: "ORIENT_NICOTINE",
        missingRequiredFields: [],
        action: "ORIENT_NICOTINE",
        nicotineEngine: "TABLE",
        memoryLoaded: Boolean(userId),
      });
      return {
        content: nic.spoken,
        suggestions: ["Voir le matériel", "Ça me convient", "Autre question"],
        products: [],
        speaking: true,
        conversationContext: {
          ...prevCtxBase,
          cigarettesPerDay: cigs,
          experienceLevel: advisorMemory.experienceLevel,
          memoryLoaded: true,
        },
      };
    }
    return {
      content:
        "Pour vous indiquer une nicotine de départ, dites-moi d'abord environ combien de cigarettes vous fumez par jour.",
      suggestions: ["Environ 10", "Environ 20", "Plus de 20"],
      products: [],
      speaking: true,
      conversationContext: prevCtxBase,
    };
  }

  // Orchestrateur commun (check-up, stock boutique, commandes, mail, transporteurs, nicotine, vape)
  {
    const { classifyAvaIntent } = await import("@/lib/ava/intents");
    const kind = classifyAvaIntent(message);
    if (
      kind === "SYSTEM_HEALTH" ||
      kind === "SYSTEM_STATUS" ||
      kind === "STOCK" ||
      kind === "ORDER" ||
      kind === "EMAIL" ||
      kind === "SHIPPING" ||
      (kind === "VAPE_KNOWLEDGE" && !isPurchaseOrBeginnerCounsel(message)) ||
      kind === "SITE" ||
      (kind === "NICOTINE" && !options?.conversationContext?.quickFlow && !isPurchaseOrBeginnerCounsel(message))
    ) {
      const { runAvaOrchestrator } = await import("@/lib/ava/orchestrator");
      const brain = await runAvaOrchestrator({
        channel: "ANDROID",
        audience: "public",
        surface: "vendeuse",
        message,
        sessionId: `site:${userId || "anon"}`.slice(0, 64),
        employeeId: null,
      });
      return {
        content: brain.response,
        suggestions: AVA_SUGGESTIONS,
        products: [],
        speaking: true,
        conversationContext: options?.conversationContext ?? undefined,
      };
    }
  }

  // Module nicotine (calcul réel + orientation freebase/sels) — avant les parcours rapides génériques
  {
    const { continueNicotineDialogue, isNicotineConversation, parseMixRequest } = await import(
      "@/lib/nicotine"
    );
    const prevCtx = options?.conversationContext ?? emptyConversationContext();
    const existingFlow = !prevCtx.diagnosticSession?.active && prevCtx.quickFlow?.flow;
    if (
      !existingFlow &&
      (prevCtx.nicotineInterview || isNicotineConversation(message) || parseMixRequest(message))
    ) {
      const turn = continueNicotineDialogue(prevCtx.nicotineInterview ?? null, message);
      if (userId && turn.done) {
        await persistNicotineHints(userId, turn);
      }
      return {
        content: turn.spoken,
        suggestions: turn.suggestions,
        products: [],
        speaking: true,
        conversationContext: {
          ...prevCtx,
          turn: (prevCtx.turn ?? 0) + 1,
          nicotineInterview: turn.done ? null : turn.interview,
          lastQuestion: turn.spoken,
        },
      };
    }
  }

  // Continuité d’un parcours rapide déjà démarré (avant FAQ boutique)
  {
    const { continueQuickFlow, getQuickFlowFromContext } = await import("@/lib/ava/quick-flows");
    const prevCtx = options?.conversationContext ?? emptyConversationContext();
    const existingFlow =
      !prevCtx.diagnosticSession?.active ? getQuickFlowFromContext(prevCtx) : null;
    if (existingFlow) {
      const step = continueQuickFlow(existingFlow, message);
      let ctx: AvaConversationContext = {
        ...prevCtx,
        turn: (prevCtx.turn ?? 0) + 1,
        quickFlow: step.continueFlow ? step.state : null,
        lastQuestion: step.content,
      };
      if (!step.continueFlow && step.catalogHint) {
        const { loadCatalogForAva } = await import("@/lib/ai/ava/load-catalog");
        const { searchProductsForAva } = await import("@/lib/ai/ava/product-search");
        const { buildAvaProductAnswer } = await import("@/lib/ai/ava/response-builder");
        const catalog = await loadCatalogForAva();
        const criteria = {
          rawQuery: message,
          category: step.catalogHint.category ?? null,
          flavorFamily:
            (step.catalogHint.flavorFamily as AvaConversationContext["flavorFamily"]) ?? null,
          flavorTerms: step.catalogHint.flavorTerms ?? [],
          freshness: step.catalogHint.freshness ?? null,
          nicotineMg: null as number | null,
          volumeMl: null as number | null,
          needsClarification: null as null,
          clarificationQuestion: null as null,
        };
        const ranked = searchProductsForAva(catalog, criteria).filter((r) => {
          const blob =
            `${r.product.name} ${r.product.brand ?? ""} ${r.product.category}`.toLowerCase();
          return !/\bpuff\b|\bjnr\b|jetable|dispos/.test(blob);
        });
        const inStock = ranked.filter((r) => !r.outOfStockExact);
        const pool = inStock.length ? inStock : ranked;
        const limit = step.catalogHint.limit ?? 3;
        const isDeviceRec = step.catalogHint.category === "cigarettes-electroniques";
        if (pool.length > 0) {
          const sliced = pool.slice(0, limit);
          const devicePool = isDeviceRec ? selectBeginnerDevicePool(sliced, limit) : null;
          const built = devicePool
            ? {
                content: devicePool.spokenLead,
                products: devicePool.products,
                suggestions: devicePool.products.map((p) => p.name),
              }
            : buildAvaProductAnswer(sliced, criteria);
          if (step.persistHints && userId) {
            if (step.persistHints.cigarettesPerDay != null) {
              advisorMemory.cigarettesPerDay = step.persistHints.cigarettesPerDay;
            }
            if (step.persistHints.allDayNeed != null) advisorMemory.allDayNeed = step.persistHints.allDayNeed;
            if (step.persistHints.advisedNicotineMg != null) {
              advisorMemory.advisedNicotineMg = step.persistHints.advisedNicotineMg;
            }
            advisorMemory.experienceLevel = "BEGINNER";
            advisorMemory.recommendedProductIds = built.products.map((p) => p.id);
            await persistAdvisorMemory(userId, advisorMemory);
          }
          logAdvisorDecision({
            experienceLevel: advisorMemory.experienceLevel,
            intent: isDeviceRec ? "DEVICE_RECOMMENDATION" : "CATALOG",
            missingRequiredFields: [],
            action: isDeviceRec ? "SHOW_DEVICE_RECOMMENDATIONS" : "CONTINUE",
            nicotineEngine: step.persistHints?.cigarettesPerDay ? "CALCULATED" : "NONE",
            memoryLoaded: Boolean(userId) || Boolean(prevCtx.memoryLoaded),
          });
          ctx = {
            ...ctx,
            category: criteria.category,
            flavorFamily: criteria.flavorFamily,
            flavorTerms: criteria.flavorTerms,
            freshness: criteria.freshness,
            lastProposedProductIds: built.products.map((p) => p.id),
            lastProposedNames: built.products.map((p) => p.name),
            cigarettesPerDay: advisorMemory.cigarettesPerDay,
            allDayNeed: advisorMemory.allDayNeed,
            experienceLevel: advisorMemory.experienceLevel,
            memoryLoaded: true,
          };
          return {
            content: `${step.content}\n\n${built.content}`,
            suggestions: built.suggestions,
            products: built.products,
            speaking: true,
            conversationContext: ctx,
          };
        }
      }
      if (step.persistHints && userId) {
        if (step.persistHints.cigarettesPerDay != null) {
          advisorMemory.cigarettesPerDay = step.persistHints.cigarettesPerDay;
        }
        await persistAdvisorMemory(userId, advisorMemory);
      }
      return {
        content: step.content,
        suggestions: step.suggestions,
        products: [],
        speaking: true,
        conversationContext: ctx,
      };
    }
  }

  const store = await storeInfo(message, options?.preferredStoreId);
  if (store) {
    return {
      content: store.startsWith("Pouvez-vous") || store.startsWith("La boutique")
        ? store
        : `Voici nos boutiques :\n\n${store}`,
      suggestions: ["E-liquide fruité", "Je débute", "Promotions"],
      products: [],
    };
  }

  const loyalty = loyaltyInfo(message);
  if (loyalty) {
    return { content: loyalty, suggestions: ["Voir la boutique", "Horaires boutique"], products: [] };
  }

  const savHint =
    /(?:^|\b)(?:sav|garantie|apr[èe]s.?vente)\b/i.test(message) &&
    !isHardwareAssistanceMessage(message);
  if (savHint) {
    // Entrée SAV sans symptôme précis → ouvrir le diagnostic plutôt qu'un blurb facture
    const { runHardwareDiagnostic } = await import("@/lib/ava/hardware-diagnostic");
    const prevCtx = options?.conversationContext ?? emptyConversationContext();
    const diag = runHardwareDiagnostic({
      message: "J'ai besoin d'aide SAV matériel",
      deviceContext: prevCtx.confirmedDevice ?? null,
      diagnosticSession: prevCtx.diagnosticSession ?? null,
    });
    return {
      content: `${savBoutiqueHint()} ${diag.content}`.trim(),
      suggestions: diag.suggestions?.slice(0, 4) ?? [
        "Ça fuit",
        "Check Atomizer",
        "Ne s'allume plus",
        "Nos magasins",
      ],
      products: [],
      speaking: true,
      conversationContext: {
        ...prevCtx,
        diagnosticSession: diag.diagnosticSession,
        confirmedDevice: diag.deviceContext,
        lastQuestion: diag.diagnosticSession.lastQuestion,
      },
      hardwareAssistance: {
        phase: diag.phase,
        showMediaUploader: true,
        showDeviceConfirmation: diag.showDeviceConfirmation,
        photoButtons: diag.photoButtons ?? [],
        candidates: diag.candidates.map((c) => ({
          manufacturer: c.manufacturer,
          model: c.model,
          modelSlug: `${c.manufacturerSlug}-${c.modelSlug}`,
          imageUrl: c.images.front ?? null,
          distinguishingFeatures: c.distinguishingFeatures ?? [],
        })),
        deviceContext: diag.deviceContext,
        diagnosticSession: diag.diagnosticSession,
      },
    };
  }

  // Exclusion explicite Puff / JNR / jetables (réponse métier, pas de recherche catalogue)
  if (/\bpuff\b|jnr|jetable|disposable/i.test(text)) {
    return {
      content:
        "Je ne recommande pas les puffs, JNR ni les produits jetables. Je peux vous orienter vers un pod rechargeable ou un e-liquide adapté — dites-moi votre usage.",
      suggestions: ["Kit pod débutant", "E-liquide fruité", "DIY", "Nos magasins"],
      products: [],
      speaking: true,
    };
  }

  // Offre Twenty — A.V.A. connaît les paliers et vérifie avant paiement
  {
    const { isShopOfferQuestion, formatShopOffersKnowledge, verifyCheckoutOffers } =
      await import("@/lib/ava/shop-offers");
    if (isShopOfferQuestion(message) || (/\btwenty\b/i.test(message) && /offre|promo|prix|panier|paye|paiement|degress/i.test(message)) || (/\b10\s*ml\b/i.test(message) && /offre|promo|prix|panier|palier|degress/i.test(message))) {
      let content = formatShopOffersKnowledge(message);
      if (options?.cartItems && options.cartItems.length > 0) {
        const lines = options.cartItems.map((i) => ({
          productId: i.productId,
          variantId: i.variantId,
          name: i.name || "Twenty",
          quantity: i.quantity,
          unitPriceCents: i.priceCents || 1290,
          category: i.category,
          productType: i.productType,
          volumeMl: i.volumeMl,
          brand: i.brand,
          range: i.range,
          rangeSlug: i.rangeSlug,
          productFamily: i.productFamily,
        }));
        const promo10Lines = options.cartItems.map((i) => ({
          productId: i.productId,
          variantId: i.variantId,
          name: i.name || "",
          quantity: i.quantity,
          unitPriceCents: i.priceCents || 0,
          category: i.category,
          productType: i.productType,
          volumeMl: i.volumeMl,
          promotion10mlEligible: i.promotion10mlEligible,
        }));
        const subtotal = options.cartItems.reduce(
          (s, i) => s + (i.priceCents || 0) * i.quantity,
          0
        );
        const verified = verifyCheckoutOffers({
          twentyLines: lines,
          promo10Lines,
          subtotalCents: subtotal,
        });
        content = `${verified.avaMessage}\n\n${content}`;
      }
      return {
        content,
        suggestions: ["Voir les offres", "Offre 10 ml", "Offre Twenty", "Nos magasins"],
        products: [],
        speaking: true,
        conversationContext: options?.conversationContext ?? undefined,
      };
    }
  }

  // Mémoire métier vape (~15 ans) — culture / technique / législation / sécurité
  {
    const {
      isVapeKnowledgeQuestion,
      searchVapeKnowledge,
      formatKnowledgeAnswer,
    } = await import("@/lib/ava/vape-knowledge");
    if (isVapeKnowledgeQuestion(message) && !isPurchaseOrBeginnerCounsel(message)) {
      const hits = searchVapeKnowledge(message, 2);
      if (hits.length > 0 && hits[0].score >= 4) {
        return {
          content: formatKnowledgeAnswer(hits),
          suggestions: [
            "Je débute",
            "Différence MTL / DL",
            "Sels ou nicotine classique",
            "Voir le catalogue",
          ],
          products: [],
          speaking: true,
        };
      }
    }
  }

  // Médiathèque pédagogique — recommandation (texte de secours si média pas encore fourni)
  {
    const { matchVideosForContext, formatVideoReply } = await import("@/lib/ava/video/videoMatcher");
    const { isExcludedVideoContext } = await import("@/lib/ava/video/videoSafety");
    if (!isExcludedVideoContext(message).excluded) {
      const prevCtx = options?.conversationContext ?? emptyConversationContext();
      const recs = matchVideosForContext({
        message,
        deviceFamily: null,
        deviceModel: prevCtx.deviceModel ?? null,
        deviceConfirmed: Boolean(prevCtx.confirmedDevice),
        diagnosticActive: Boolean(prevCtx.diagnosticSession?.active),
        allowDraftFallbackText: true,
      });
      if (recs.length > 0 && /video|vidéo|tuto|tutoriel|reconstructible|rta\b|rda\b|check\s*atomizer|montre/i.test(message)) {
        const text = formatVideoReply(recs);
        if (text) {
          return {
            content: text,
            suggestions: [
              "Le problème est résolu",
              "Continuer le diagnostic",
              "Nos magasins",
            ],
            products: [],
            speaking: true,
            conversationContext: {
              ...prevCtx,
              // ne pas ouvrir le catalogue
            },
            videoRecommendations: recs.map((r) => ({
              ...r.video,
              reason: r.reason,
              followUpQuestion: r.followUpQuestion,
              safetyNotice: r.video.safetyNotice,
            })),
          };
        }
      }
    }
  }

  // Mode assistance matériel (priorité session diagnostic → jamais catalogue implicite)
  {
    const { runHardwareDiagnostic } = await import("@/lib/ava/hardware-diagnostic");
    const { detectHardwareIntent } = await import("@/lib/ava/hardware-intent-detector");
    const prevCtx = options?.conversationContext ?? emptyConversationContext();
    const prevSession = prevCtx.diagnosticSession ?? null;
    const deviceContext =
      prevCtx.confirmedDevice ??
      null;
    const forceDiagnostic =
      Boolean(prevSession?.active) ||
      ((detectHardwareIntent(message).isHardware ||
        isSavOrHardwareIntent(message) ||
        /check\s*atomizer|drag\s*6|voopoo|sav|panne/i.test(message)) &&
        !(isPurchaseOrBeginnerCounsel(message) && !hasHardwareProblemSignal(message)));

    if (forceDiagnostic) {
      const diag = runHardwareDiagnostic({
        message,
        deviceContext,
        diagnosticSession: prevSession,
      });
      if (diag.assistanceMode && diag.content) {
        return {
          content: diag.content,
          suggestions:
            diag.suggestions?.slice(0, 4) ||
            (diag.showMediaUploader
              ? ["Ajouter une photo", "Nos magasins", "Continuer"]
              : ["Nos magasins", "Oui, c'est la Drag 6", "Ce n'est pas celui-ci"]),
          products: [],
          speaking: true,
          conversationContext: {
            ...prevCtx,
            deviceModel: diag.deviceContext
              ? `${diag.deviceContext.manufacturer} ${diag.deviceContext.model}`
              : prevCtx.deviceModel ?? null,
            manufacturer: diag.deviceContext?.manufacturer ?? prevCtx.manufacturer,
            confirmedDevice: diag.deviceContext,
            diagnosticSession: diag.diagnosticSession,
            lastQuestion: diag.diagnosticSession.lastQuestion,
          },
          hardwareAssistance: {
            phase: diag.phase,
            showMediaUploader: diag.showMediaUploader || diag.diagnosticSession.active,
            showDeviceConfirmation: diag.showDeviceConfirmation,
            photoButtons: diag.photoButtons ?? [],
            candidates: diag.candidates.map((c) => ({
              manufacturer: c.manufacturer,
              model: c.model,
              modelSlug: `${c.manufacturerSlug}-${c.modelSlug}`,
              imageUrl: c.images.front ?? null,
              distinguishingFeatures: c.distinguishingFeatures ?? [],
            })),
            deviceContext: diag.deviceContext,
            diagnosticSession: diag.diagnosticSession,
          },
        };
      }
      // assistanceMode false mais session venait d'être fermée pour catalogue → laisser passer
      if (diag.blockProductSearch && diag.content) {
        return {
          content: diag.content,
          suggestions: diag.suggestions ?? ["Continuer"],
          products: [],
          speaking: true,
          conversationContext: {
            ...prevCtx,
            confirmedDevice: diag.deviceContext,
            diagnosticSession: diag.diagnosticSession,
          },
        };
      }
    }
  }

  // Démarrage d’une action rapide (après diagnostic actif)
  {
    const { matchQuickIntentFromMessage, startQuickFlow } = await import(
      "@/lib/ava/quick-flows"
    );
    const prevCtx = options?.conversationContext ?? emptyConversationContext();
    if (!prevCtx.diagnosticSession?.active) {
      const matchedIntent = matchQuickIntentFromMessage(message);
      if (matchedIntent) {
        const beginnerIntent =
          matchedIntent === "BEGINNER_VAPING" || matchedIntent === "BEGINNER_DEVICE_GUIDANCE";
        if (beginnerIntent && shouldSkipBeginnerQuiz(advisorMemory.experienceLevel, message)) {
          logAdvisorDecision({
            experienceLevel: advisorMemory.experienceLevel,
            intent: "FREE_EXPERT",
            missingRequiredFields: [],
            action: "FREE_EXPERT",
            nicotineEngine: advisorMemory.usedNicotineMg != null ? "MEMORIZED" : "NONE",
            memoryLoaded: Boolean(userId),
          });
        } else {
          const seed =
            beginnerIntent && advisorMemory.cigarettesPerDay
              ? `je fume ${advisorMemory.cigarettesPerDay} cigarettes par jour${
                  advisorMemory.allDayNeed ? " toute la journée" : ""
                }. ${message}`
              : message;
          const started = startQuickFlow(matchedIntent, seed);
          if (started) {
            if (!started.continueFlow && started.catalogHint) {
              const hinted = await replyFromCatalogHint(started, prevCtx, message, userId, advisorMemory);
              if (hinted) return hinted;
            }
            return {
              content: started.content,
              suggestions: started.suggestions,
              products: [],
              speaking: true,
              conversationContext: {
                ...prevCtx,
                turn: (prevCtx.turn ?? 0) + 1,
                quickFlow: started.state,
                lastQuestion: started.content,
                diagnosticSession: null,
                experienceLevel: advisorMemory.experienceLevel,
                cigarettesPerDay: advisorMemory.cigarettesPerDay,
                memoryLoaded: true,
              },
            };
          }
        }
      }
    }
  }

  if (
    userId &&
    /\b(commande|commandes|colis|livraison|suivi|où\s+en\s+est|statut)\b/i.test(text)
  ) {
    const { getCustomerOrdersForAva, formatOrdersForAvaPrompt } = await import(
      "@/lib/ai/ava/customer-orders"
    );
    const orders = await getCustomerOrdersForAva(userId, 5);
    return {
      content:
        orders.length === 0
          ? "Je ne trouve aucune commande associée à votre compte pour le moment."
          : `Voici vos commandes récentes :\n${formatOrdersForAvaPrompt(orders)}`,
      suggestions: ["Voir mon compte", "Voir la boutique"],
      products: [],
      speaking: true,
    };
  }

  if (isFlavorTooEarly(message) && !prevCtxBase.quickFlow?.flow) {
    const { startFlavorOrientation } = await import("@/lib/ava/quick-flows");
    const started = startFlavorOrientation();
    return {
      content: started.content,
      suggestions: started.suggestions,
      products: [],
      speaking: true,
      conversationContext: {
        ...prevCtxBase,
        quickFlow: started.state,
        lastQuestion: started.content,
        experienceLevel: advisorMemory.experienceLevel,
      },
    };
  }

  const merged = mergeContextFromMessage(
    options?.conversationContext,
    message,
    options?.preferredStoreId ?? options?.conversationContext?.preferredStoreId ?? null
  );
  let ctx = merged.context;
  ctx = {
    ...ctx,
    experienceLevel: advisorMemory.experienceLevel,
    cigarettesPerDay: advisorMemory.cigarettesPerDay,
    memoryLoaded: true,
  };
  const criteria = merged;
  if (
    (advisorMemory.experienceLevel === "EXPERT" || advisorMemory.experienceLevel === "AUTONOMOUS") &&
    advisorMemory.usedNicotineMg != null &&
    criteria.nicotineMg == null &&
    !/cigarette.?electron|materiel|pod|kit|box/i.test(message)
  ) {
    criteria.nicotineMg = advisorMemory.usedNicotineMg;
    ctx.nicotineMg = advisorMemory.usedNicotineMg;
  }

  // Référence à un produit déjà proposé (« le deuxième », « lequel vous me conseillez »)
  const parsedRef = parseProductReference(message, ctx.lastProposedNames);
  const askPick = isAskToPickRecommended(message) && ctx.lastProposedProductIds[0];
  const confirmPick = isConfirmRecommendedDevice(message) && ctx.lastProposedProductIds[0];
  const refIdx = parsedRef ?? (askPick || confirmPick ? 0 : null);
  if (refIdx != null && ctx.lastProposedProductIds[refIdx]) {
    const catalog = await loadCatalogForAva();
    const product = catalog.find((p) => p.id === ctx.lastProposedProductIds[refIdx]);
    if (product) {
      const ranked = [
        {
          product,
          score: 100,
          matchedVariant: product.variants.find((v) => v.stock > 0) ?? product.variants[0] ?? null,
          reason: "sélection",
          needsVerification: product.catalogStatus === "a_verifier",
          outOfStockExact: product.availableQuantity <= 0,
        },
      ];
      if (ranked[0].outOfStockExact) {
        return {
          content: buildOutOfStockAnswer(product.name),
          suggestions: ["Alternative", "Autre saveur", "Nos magasins"],
          products: [],
          conversationContext: ctx,
          speaking: true,
        };
      }
      const built = buildAvaProductAnswer(ranked, criteria);
      if (askPick && !confirmPick) {
        return {
          content: `Pour vous, je partirais sur ${product.name}. C'est celui que je trouve le plus simple et le plus adapté pour commencer.`,
          suggestions: ["Je prends celui-là", "Voir une alternative", "Question nicotine"],
          products: built.products,
          conversationContext: {
            ...ctx,
            lastProposedProductIds: [product.id],
            lastProposedNames: [product.name],
            experienceLevel: advisorMemory.experienceLevel,
          },
          speaking: true,
        };
      }
      const guide = presentDeviceGuide(product.name, advisorMemory.experienceLevel);
      advisorMemory.selectedDeviceName = product.name;
      advisorMemory.currentDeviceName = product.name;
      if (userId) await persistAdvisorMemory(userId, advisorMemory);
      return {
        content: `D'accord, on part sur le ${product.name}. ${guide.spoken}`,
        suggestions: built.suggestions,
        products: built.products,
        conversationContext: {
          ...ctx,
          pendingDeviceGuideQuery: product.name,
          deviceModel: product.name,
          experienceLevel: advisorMemory.experienceLevel,
        },
        speaking: true,
        deviceGuide: guide,
      };
    }
  }

  if (criteria.needsClarification && criteria.clarificationQuestion) {
    const clar = buildClarificationAnswer(criteria.clarificationQuestion);
    return {
      ...clar,
      conversationContext: ctx,
      speaking: true,
    };
  }

  // Recherche catalogue réelle
  let catalog;
  try {
    catalog = await loadCatalogForAva();
  } catch (err) {
    console.error("[ava] loadCatalogForAva failed", err);
    return {
      content:
        "Je n'arrive pas à accéder au catalogue produits pour le moment. Réessayez dans un instant, ou précisez une saveur / un type de matériel et je vous oriente autrement.",
      suggestions: AVA_SUGGESTIONS,
      products: [],
      conversationContext: ctx,
      speaking: true,
    };
  }

  if (/promo|promotion|solde|offre/i.test(text)) {
    criteria.promoOnly = true;
  }
  if (/nouveaut|nouveau|new/i.test(text)) {
    criteria.newOnly = true;
  }

  // Résistance sans modèle → déjà clarification device
  let ranked = searchProductsForAva(catalog, criteria);
  let usedAlternatives = false;

  if (ranked.length === 0) {
    ranked = searchNearbyAlternatives(catalog, criteria);
    usedAlternatives = ranked.length > 0;
  }

  // Profil connecté en dernier recours
  if (ranked.length === 0 && userId) {
    let profile = (await getVapeProfile(userId)) ?? emptyVapeProfile();
    const updates = extractProfileUpdates(message);
    if (Object.keys(updates).length > 0) {
      profile = mergeProfileUpdates(profile, updates);
      await upsertVapeProfile(userId, {
        ...profile,
        gdprConsent: profile.gdprConsent || true,
        personalizedEnabled: true,
      });
    }
    if (profile.gdprConsent) {
      const legacy = await loadCatalog();
      const recs = getPersonalizedRecommendations(legacy, profile, { limit: 3 });
      ranked = recs
        .map((r) => {
          const full = catalog.find((p) => p.id === r.product.id);
          if (!full || full.availableQuantity <= 0) return null;
          return {
            product: full,
            score: 50,
            matchedVariant: full.variants.find((v) => v.stock > 0) ?? null,
            reason: "profil",
            needsVerification: full.catalogStatus === "a_verifier",
            outOfStockExact: false,
          };
        })
        .filter(Boolean) as typeof ranked;
    }
  }

  if (ranked.length > 0) {
    const built = buildAvaProductAnswer(ranked, criteria, {
      alternatives: usedAlternatives,
    });
    ctx = {
      ...ctx,
      lastProposedProductIds: built.products.map((p) => p.id),
      lastProposedNames: built.suggestions.length
        ? built.suggestions
        : built.products.map((p) => p.name),
      lastQuestion: null,
    };

    if (userId) {
      try {
        for (const p of built.products) {
          await addRecommendation(userId, p.id, built.products[0]?.reason ?? "catalogue", 1, "ava");
        }
      } catch (err) {
        console.error("[ava] addRecommendation failed", err);
      }
    }

    return {
      content: built.content,
      suggestions: built.suggestions,
      products: built.products,
      conversationContext: ctx,
      speaking: true,
    };
  }

  return {
    content:
      "Je n'ai pas trouvé de produit disponible pour cette demande. Précisez une saveur, un format ou un type de matériel — je regarde dans le catalogue.",
    suggestions: AVA_SUGGESTIONS,
    products: [],
    conversationContext: ctx,
    speaking: true,
  };
}

async function persistNicotineHints(
  userId: string,
  turn: { interview: import("@/lib/nicotine").NicotineInterviewState | null }
) {
  const input = turn.interview?.input;
  if (!input) return;
  try {
    const current = (await getVapeProfile(userId)) ?? emptyVapeProfile();
    await upsertVapeProfile(userId, {
      ...current,
      cigarettesPerDay: input.cigarettesPerDay ?? current.cigarettesPerDay,
      usedNicotineMg:
        input.currentNicotineMg != null
          ? Math.round(input.currentNicotineMg)
          : current.usedNicotineMg,
      lastRecommendationAt: new Date().toISOString(),
    });
  } catch {
    /* profil optionnel — ne pas faire échouer AVA */
  }
}

async function persistAdvisorMemory(userId: string, memory: AvaCustomerMemory) {
  try {
    const current = await getVapeProfile(userId);
    if (!current) return;
    await upsertVapeProfile(userId, {
      ...current,
      ...toVapeProfilePatch(memory),
    });
  } catch {
    /* RGPD / profil optionnel */
  }
}

async function replyFromCatalogHint(
  step: import("@/lib/ava/quick-flows").QuickFlowResult,
  prevCtx: AvaConversationContext,
  message: string,
  userId: string | undefined,
  advisorMemory: AvaCustomerMemory,
): Promise<AvaReply | null> {
  if (!step.catalogHint) return null;
  const { loadCatalogForAva } = await import("@/lib/ai/ava/load-catalog");
  const { searchProductsForAva } = await import("@/lib/ai/ava/product-search");
  const { buildAvaProductAnswer } = await import("@/lib/ai/ava/response-builder");
  const catalog = await loadCatalogForAva();
  const criteria = {
    rawQuery: message,
    category: step.catalogHint.category ?? null,
    flavorFamily: (step.catalogHint.flavorFamily as AvaConversationContext["flavorFamily"]) ?? null,
    flavorTerms: step.catalogHint.flavorTerms ?? [],
    freshness: step.catalogHint.freshness ?? null,
    nicotineMg: null as number | null,
    volumeMl: null as number | null,
    needsClarification: null as null,
    clarificationQuestion: null as null,
  };
  const ranked = searchProductsForAva(catalog, criteria).filter((r) => {
    const blob = `${r.product.name} ${r.product.brand ?? ""} ${r.product.category}`.toLowerCase();
    return !/\bpuff\b|\bjnr\b|jetable|dispos/.test(blob);
  });
  const inStock = ranked.filter((r) => !r.outOfStockExact);
  const pool = inStock.length ? inStock : ranked;
  const limit = step.catalogHint.limit ?? 3;
  if (pool.length === 0) return null;
  const sliced = pool.slice(0, limit);
  const isDeviceRec = step.catalogHint.category === "cigarettes-electroniques";
  const devicePool = isDeviceRec ? selectBeginnerDevicePool(sliced, limit) : null;
  const built = devicePool
    ? {
        content: devicePool.spokenLead,
        products: devicePool.products,
        suggestions: devicePool.products.map((p) => p.name),
      }
    : buildAvaProductAnswer(sliced, criteria);
  if (step.persistHints && userId) {
    if (step.persistHints.cigarettesPerDay != null) {
      advisorMemory.cigarettesPerDay = step.persistHints.cigarettesPerDay;
    }
    if (step.persistHints.allDayNeed != null) advisorMemory.allDayNeed = step.persistHints.allDayNeed;
    if (step.persistHints.advisedNicotineMg != null) {
      advisorMemory.advisedNicotineMg = step.persistHints.advisedNicotineMg;
    }
    advisorMemory.recommendedProductIds = built.products.map((p) => p.id);
    await persistAdvisorMemory(userId, advisorMemory);
  }
  logAdvisorDecision({
    experienceLevel: advisorMemory.experienceLevel,
    intent: isDeviceRec ? "DEVICE_RECOMMENDATION" : "CATALOG",
    missingRequiredFields: [],
    action: isDeviceRec ? "SHOW_DEVICE_RECOMMENDATIONS" : "CONTINUE",
    nicotineEngine: step.persistHints?.cigarettesPerDay ? "CALCULATED" : "NONE",
    memoryLoaded: Boolean(userId),
  });
  return {
    content: `${step.content}\n\n${built.content}`,
    suggestions: built.suggestions,
    products: built.products,
    speaking: true,
    conversationContext: {
      ...prevCtx,
      turn: (prevCtx.turn ?? 0) + 1,
      quickFlow: null,
      category: criteria.category,
      lastProposedProductIds: built.products.map((p) => p.id),
      lastProposedNames: built.products.map((p) => p.name),
      cigarettesPerDay: advisorMemory.cigarettesPerDay,
      allDayNeed: advisorMemory.allDayNeed,
      experienceLevel: advisorMemory.experienceLevel,
      memoryLoaded: true,
    },
  };
}
