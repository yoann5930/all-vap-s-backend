import prisma from "@/lib/prisma";
import { stores } from "@/lib/stores";
import { getVapeProfile, upsertVapeProfile, addRecommendation } from "@/lib/vape-profile/service";
import { extractProfileUpdates, mergeProfileUpdates } from "@/lib/vape-profile/learning";
import { emptyVapeProfile, MEDICAL_DISCLAIMER } from "@/lib/vape-profile/types";
import { getPersonalizedRecommendations } from "@/lib/recommendations/engine";
import {
  searchCatalog,
  searchCatalogAlternatives,
  recommendForProfile,
  type CatalogProduct,
} from "@/lib/ai/catalog-search";
import { isAgeConfirmed, AGE_REFUSAL } from "@/lib/ai/sales-script";
import {
  AVA_GREETING,
  AVA_SUGGESTIONS,
  AVA_NO_EXACT_MATCH,
  AVA_NAME_REPLY,
} from "@/lib/ai/ava-constants";
import { parseCatalogSpecs } from "@/lib/ai/ava-speech-utils";

export { AVA_GREETING, AVA_SUGGESTIONS } from "@/lib/ai/ava-constants";

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
}

export interface AvaReply {
  content: string;
  suggestions: string[];
  products: AvaProductCard[];
  blocked?: boolean;
  speaking?: boolean;
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
  };
}

async function loadCatalog(): Promise<CatalogProduct[]> {
  const rows = await prisma.product.findMany({ where: { isActive: true } });
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

function storeInfo(text: string): string | null {
  const lower = text.toLowerCase();
  if (!/boutique|magasin|horaire|adresse|où|ou trouver|contact|téléphone|telephone/i.test(lower)) {
    return null;
  }

  const storeMatch = stores.find(
    (s) => lower.includes(s.city.toLowerCase()) || lower.includes(s.id.replace("-", " "))
  );

  if (storeMatch) {
    return `${storeMatch.name}\n${storeMatch.address}, ${storeMatch.postalCode} ${storeMatch.city}\n${storeMatch.phone}\n\nHoraires :\n${storeMatch.hours.join("\n")}`;
  }

  return stores
    .map((s) => `• ${s.name} — ${s.address}, ${s.city}\n  ${s.hours[0]} · ${s.phone}`)
    .join("\n\n");
}

function loyaltyInfo(text: string): string | null {
  if (!/fid[ée]lit[ée]|points|qr|carte/i.test(text.toLowerCase())) return null;
  return "Programme fidélité All Vap's : cumulez des points à chaque achat. Consultez votre solde dans Mon compte → Fidélité.";
}

function savInfo(text: string): string | null {
  if (!/sav|garantie|apr[èe]s.?vente|panne|r[ée]paration|retour/i.test(text.toLowerCase())) {
    return null;
  }
  return "SAV All Vap's : diagnostic en boutique Hautmont et Le Quesnoy. Apportez votre facture — on teste et on vous oriente.";
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
  let greeting = AVA_GREETING;
  let suggestions = [...AVA_SUGGESTIONS];

  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true } });
    const profile = (await getVapeProfile(userId)) ?? emptyVapeProfile();

    if (user?.firstName) {
      greeting = `Bonjour ${user.firstName}, je m'appelle Ava.\n\nQue recherchez-vous ?`;
    }

    if (profile.gdprConsent && profile.preferredFlavors.length > 0) {
      const products = await loadCatalog();
      const newRecs = getPersonalizedRecommendations(products, profile, { limit: 1, newOnly: true });
      if (newRecs.length > 0) {
        greeting += `\n\nUne nouveauté pourrait vous plaire : ${newRecs[0].product.name}.`;
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

export async function chatAva(userId: string | undefined, message: string): Promise<AvaReply> {
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
      content: "Les prix sont indiqués sur chaque produit. Dites-moi plutôt ce que vous cherchez.",
      suggestions: AVA_SUGGESTIONS,
      products: [],
      speaking: true,
    };
  }

  const store = storeInfo(message);
  if (store) {
    return {
      content: `Voici nos boutiques :\n\n${store}`,
      suggestions: ["E-liquide fruité", "Je débute", "Promotions"],
      products: [],
    };
  }

  const loyalty = loyaltyInfo(message);
  if (loyalty) {
    return { content: loyalty, suggestions: ["Voir la boutique", "Horaires boutique"], products: [] };
  }

  const sav = savInfo(message);
  if (sav) {
    return { content: sav, suggestions: ["Nos magasins", "Voir le matériel"], products: [] };
  }

  const products = await loadCatalog();
  let profile = userId ? (await getVapeProfile(userId)) ?? emptyVapeProfile() : emptyVapeProfile();

  if (userId) {
    const updates = extractProfileUpdates(message);
    if (Object.keys(updates).length > 0) {
      profile = mergeProfileUpdates(profile, updates);
      await upsertVapeProfile(userId, {
        ...profile,
        gdprConsent: profile.gdprConsent || true,
        personalizedEnabled: true,
      });
    }
  }

  let picks: CatalogProduct[] = [];
  let intro = "";
  let reason = "catalogue";
  let usedAlternatives = false;

  const runSearch = (q: string, opts?: Parameters<typeof searchCatalog>[2]) =>
    searchCatalog(products, q, { limit: 4, ...opts });

  if (/promo|promotion|solde|offre/i.test(text)) {
    picks = runSearch(message, { promoOnly: true });
    intro = "Voici nos promotions du moment.";
    reason = "promotion";
  } else if (/nouveaut|nouveau|new/i.test(text)) {
    picks = runSearch(message, { newOnly: true });
    intro = "Voici nos nouveautés.";
    reason = "nouveauté";
  } else if (/r[ée]sistance|coil|mesh/i.test(text)) {
    picks = runSearch(message, { category: "resistance" });
    if (picks.length === 0) picks = runSearch(message);
    if (picks.length === 0) picks = runSearch("résistance coil");
    intro = /vaporesso/i.test(text)
      ? "Voici les résistances Vaporesso disponibles."
      : "Voici les résistances qui correspondent.";
    reason = "résistance";
  } else if (/accu|batterie|18650|21700/i.test(text)) {
    picks = runSearch(message, { category: "accu" });
    if (picks.length === 0) picks = runSearch(message);
    intro = "Voici les accus et batteries disponibles.";
    reason = "batterie";
  } else if (/chargeur/i.test(text)) {
    picks = runSearch(message);
    intro = "Voici nos chargeurs.";
    reason = "chargeur";
  } else if (/clearomiseur|clearo|atomiseur/i.test(text)) {
    picks = runSearch(message);
    intro = "Voici les clearomiseurs disponibles.";
    reason = "clearomiseur";
  } else if (/\bdiy\b|base\s+diy|ar[ôo]me/i.test(text)) {
    picks = runSearch(message, { category: "diy" });
    if (picks.length === 0) picks = runSearch("diy base arôme");
    intro = "Voici notre sélection DIY.";
    reason = "DIY";
  } else if (/\bpuff\b|jetable/i.test(text)) {
    picks = runSearch(message);
    if (picks.length === 0) picks = runSearch("puff");
    intro = "Voici les puffs disponibles.";
    reason = "puff";
  } else if (/d[ée]but|commenc|premier|starter|nouveau vapoteur/i.test(text)) {
    picks = runSearch("kit pod starter cigarette débutant");
    intro = "Voici des kits simples pour bien démarrer.";
    reason = "débutant";
  } else if (/arr[êe]t\s+(du\s+)?tabac|sevrage|gros\s+fumeur|petit\s+fumeur/i.test(text)) {
    picks = runSearch("pod kit MTL nicotine");
    intro =
      /gros\s+fumeur/i.test(text)
        ? "Pour un gros fumeur, voici des pods adaptés à un tirage serré."
        : /petit\s+fumeur/i.test(text)
          ? "Pour un petit fumeur, voici des options douces pour commencer."
          : "Voici des kits adaptés pour accompagner l'arrêt du tabac.";
    reason = "accompagnement";
  } else if (/tirage\s+serr[ée]|mtl/i.test(text)) {
    picks = runSearch("pod MTL kit tirage serré");
    intro = "Voici des modèles en tirage serré (MTL).";
    reason = "MTL";
  } else if (/tirage\s+a[ée]rien|sub.?ohm|\bdl\b/i.test(text)) {
    picks = runSearch("box DL subohm");
    intro = "Voici des modèles en tirage aérien (DL).";
    reason = "DL";
  } else if (
    /frais\s*rouge|fruits?\s*rouges?|menthe|mangue|citron|vanille|classic|fruit|liquide|e-liquid|eliquide|saveur|gourmand|menthol/i.test(
      text
    )
  ) {
    picks = runSearch(message);
    if (picks.length === 0 && userId && profile.gdprConsent) {
      picks = recommendForProfile(products, profile, 4);
      reason = "selon votre profil";
    }
    if (/frais\s*rouge/i.test(text)) intro = "Voici les e-liquides Frais Rouge disponibles dans notre boutique.";
    else if (/fruits?\s*rouges?/i.test(text)) intro = "Voici les e-liquides Fruits Rouges disponibles.";
    else if (/menthe/i.test(text)) intro = "Voici les e-liquides menthe disponibles.";
    else if (/diy/i.test(text)) intro = "Voici notre sélection DIY.";
    else intro = "Voici les e-liquides qui correspondent à votre recherche.";
    reason = reason === "selon votre profil" ? reason : "saveur";
  } else if (/cigarette|[ée]lectronique|pod|box|mod|mat[ée]riel|kit(?!\s*diy)/i.test(text)) {
    picks = runSearch(message);
    intro = "Voici les modèles qui pourraient vous convenir.";
    reason = "matériel";
  } else if (userId && profile.gdprConsent) {
    const recs = getPersonalizedRecommendations(products, profile, { limit: 3 });
    if (recs.length > 0) {
      picks = recs.map((r) => ({
        ...r.product,
        imageUrl: (r.product as CatalogProduct).imageUrl ?? null,
      }));
      intro = "Voici ce qui correspond le mieux à votre profil.";
      reason = "profil";
    }
  }

  const exactCount = picks.length;

  if (picks.length === 0) {
    picks = searchCatalogAlternatives(products, message, 4);
    if (picks.length > 0) {
      usedAlternatives = true;
      intro = AVA_NO_EXACT_MATCH;
      reason = "alternatives";
    }
  } else if (exactCount > 0) {
    // Si la requête est très spécifique et le meilleur score faible → alternatives message
    // (géré déjà par search si score > 0)
  }

  if (picks.length === 0 && /voir la nouveaut/i.test(text) && userId) {
    const recs = getPersonalizedRecommendations(products, profile, { limit: 1, newOnly: true });
    if (recs.length) {
      picks = recs.map((r) => ({
        ...r.product,
        imageUrl: (r.product as CatalogProduct).imageUrl ?? null,
      }));
      intro = "Voici la nouveauté repérée pour vous.";
      reason = "nouveauté";
    }
  }

  if (picks.length > 0) {
    if (userId) {
      for (const p of picks.slice(0, 3)) {
        await addRecommendation(userId, p.id, reason, 1, "ava");
      }
    }

    const finalIntro =
      usedAlternatives || !intro
        ? intro || AVA_NO_EXACT_MATCH
        : intro;

    return productReply(
      finalIntro,
      picks,
      reason,
      picks.slice(0, 3).map((p) => p.name)
    );
  }

  return {
    content:
      "Dites-moi ce que vous cherchez : une saveur, un DIY, une puff, une résistance ou une cigarette électronique. " +
      MEDICAL_DISCLAIMER,
    suggestions: AVA_SUGGESTIONS,
    products: [],
  };
}
