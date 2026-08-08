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
import { isAgeConfirmed, AGE_REFUSAL } from "@/lib/ai/sales-script";
import {
  AVA_GREETING,
  AVA_SUGGESTIONS,
  AVA_NAME_REPLY,
} from "@/lib/ai/ava-constants";
import { parseCatalogSpecs } from "@/lib/ai/ava-speech-utils";

export { AVA_GREETING, AVA_SUGGESTIONS } from "@/lib/ai/ava-constants";

export type AvaChatOptions = {
  /** Boutique mémorisée côté client uniquement (jamais de GPS). */
  preferredStoreId?: PreferredStoreId | null;
  /** Mémoire de conversation temporaire (session client). */
  conversationContext?: AvaConversationContext | null;
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
      greeting = pickNamedGreeting(display);
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
    "Bonjour, je m'appelle Ava. Comment puis-je vous aider aujourd'hui ?",
    "Bonjour ! Je suis Ava. Que recherchez-vous ?",
    "Bienvenue chez All Vap's. Je m'appelle Ava — dites-moi ce que vous cherchez.",
  ];
  return list[Math.floor(Math.random() * list.length)];
}

function pickNamedGreeting(name: string): string {
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

  const ageCheck = isAgeConfirmed(message);
  if (ageCheck === false || /mineur|moins de 18|< 18 ans/i.test(text)) {
    return { content: AGE_REFUSAL, suggestions: [], products: [], blocked: true };
  }

  if (isNameQuestion(message)) {
    return {
      content: AVA_NAME_REPLY,
      suggestions: AVA_SUGGESTIONS,
      products: [],
      speaking: true,
    };
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
        if (ranked.length > 0) {
          const built = buildAvaProductAnswer(ranked.slice(0, 4), criteria);
          ctx = {
            ...ctx,
            category: criteria.category,
            flavorFamily: criteria.flavorFamily,
            flavorTerms: criteria.flavorTerms,
            freshness: criteria.freshness,
            lastProposedProductIds: built.products.map((p) => p.id),
            lastProposedNames: built.products.map((p) => p.name),
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

  // Mémoire métier vape (~15 ans) — culture / technique / législation / sécurité
  {
    const {
      isVapeKnowledgeQuestion,
      searchVapeKnowledge,
      formatKnowledgeAnswer,
    } = await import("@/lib/ava/vape-knowledge");
    if (isVapeKnowledgeQuestion(message)) {
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
      detectHardwareIntent(message).isHardware ||
      isSavOrHardwareIntent(message) ||
      /check\s*atomizer|drag\s*6|voopoo|sav|panne/i.test(message);

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
        const started = startQuickFlow(matchedIntent);
        if (started) {
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
            },
          };
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

  const merged = mergeContextFromMessage(
    options?.conversationContext,
    message,
    options?.preferredStoreId ?? options?.conversationContext?.preferredStoreId ?? null
  );
  let ctx = merged.context;
  const criteria = merged;

  // Référence à un produit déjà proposé (« le deuxième »)
  const refIdx = parseProductReference(message, ctx.lastProposedNames);
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
      return {
        content: built.content,
        suggestions: built.suggestions,
        products: built.products,
        conversationContext: ctx,
        speaking: true,
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
  const catalog = await loadCatalogForAva();

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
