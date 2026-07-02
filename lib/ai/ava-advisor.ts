import prisma from "@/lib/prisma";
import { stores } from "@/lib/stores";
import { getVapeProfile, upsertVapeProfile, addRecommendation } from "@/lib/vape-profile/service";
import { extractProfileUpdates, mergeProfileUpdates } from "@/lib/vape-profile/learning";
import { emptyVapeProfile, MEDICAL_DISCLAIMER } from "@/lib/vape-profile/types";
import { getPersonalizedRecommendations } from "@/lib/recommendations/engine";
import { searchCatalog, recommendForProfile, type CatalogProduct } from "@/lib/ai/catalog-search";
import { isAgeConfirmed, AGE_REFUSAL } from "@/lib/ai/sales-script";
import { AVA_GREETING, AVA_SUGGESTIONS } from "@/lib/ai/ava-constants";

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
}

export interface AvaReply {
  content: string;
  suggestions: string[];
  products: AvaProductCard[];
  blocked?: boolean;
  speaking?: boolean;
}

function toCard(p: CatalogProduct, reason: string): AvaProductCard {
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
  };
}

async function loadCatalog(): Promise<CatalogProduct[]> {
  const rows = await prisma.product.findMany({ where: { isActive: true } });
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
    imageUrl: p.imageUrl,
    isActive: p.isActive,
  }));
}

function storeInfo(text: string): string | null {
  const lower = text.toLowerCase();
  if (!/boutique|magasin|horaire|adresse|où|ou trouver|contact|téléphone|telephone/i.test(lower)) {
    return null;
  }

  const storeMatch = stores.find(
    (s) =>
      lower.includes(s.city.toLowerCase()) ||
      lower.includes(s.id.replace("-", " "))
  );

  if (storeMatch) {
    return `${storeMatch.name}\n📍 ${storeMatch.address}, ${storeMatch.postalCode} ${storeMatch.city}\n📞 ${storeMatch.phone}\n✉️ ${storeMatch.email}\n\nHoraires :\n${storeMatch.hours.join("\n")}`;
  }

  return stores
    .map(
      (s) =>
        `• ${s.name} — ${s.address}, ${s.city}\n  ${s.hours[0]} · ${s.phone}`
    )
    .join("\n\n");
}

function loyaltyInfo(text: string): string | null {
  if (!/fid[ée]lit[ée]|points|qr|carte/i.test(text.toLowerCase())) return null;
  return "Programme fidélité All Vap's : cumulez des points à chaque achat en boutique ou en ligne. Consultez votre solde et QR code dans Mon compte → Fidélité. Nos équipes en magasin activent votre carte en quelques secondes.";
}

function savInfo(text: string): string | null {
  if (!/sav|garantie|apr[èe]s.?vente|panne|r[ée]paration|retour/i.test(text.toLowerCase())) {
    return null;
  }
  return "Service après-vente All Vap's : garantie constructeur sur le matériel, diagnostic en boutique Hautmont et Le Quesnoy. Apportez votre facture ou votre compte client — nos experts testent votre matériel et proposent réparation ou échange selon la garantie.";
}

export async function initAva(userId?: string) {
  let greeting = AVA_GREETING;
  let suggestions = [...AVA_SUGGESTIONS];

  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true } });
    const profile = (await getVapeProfile(userId)) ?? emptyVapeProfile();

    if (user?.firstName) {
      greeting = `Bonjour ${user.firstName} 👋\n\n` + AVA_GREETING.split("\n\n").slice(1).join("\n\n");
    }

    if (profile.gdprConsent && profile.preferredFlavors.length > 0) {
      const products = await loadCatalog();
      const newRecs = getPersonalizedRecommendations(products, profile, { limit: 1, newOnly: true });
      if (newRecs.length > 0) {
        greeting += `\n\nJ'ai repéré une nouveauté pour vous : ${newRecs[0].product.name}.`;
        suggestions = ["Voir la nouveauté", ...AVA_SUGGESTIONS.slice(0, 3)];
      }
    }
  }

  return {
    message: greeting,
    suggestions,
    isLoggedIn: Boolean(userId),
    agentName: "A.V.A.",
  };
}

export async function chatAva(userId: string | undefined, message: string): Promise<AvaReply> {
  const text = message.toLowerCase();

  const ageCheck = isAgeConfirmed(message);
  if (ageCheck === false || /mineur|moins de 18|< 18 ans/i.test(text)) {
    return { content: AGE_REFUSAL, suggestions: [], products: [], blocked: true };
  }

  const store = storeInfo(message);
  if (store) {
    return {
      content: `Voici nos boutiques All Vap's :\n\n${store}\n\n${MEDICAL_DISCLAIMER}`,
      suggestions: ["E-liquide fruité", "Je débute", "Promotions"],
      products: [],
    };
  }

  const loyalty = loyaltyInfo(message);
  if (loyalty) {
    return {
      content: `${loyalty}\n\n${MEDICAL_DISCLAIMER}`,
      suggestions: ["Voir la boutique", "Horaires boutique"],
      products: [],
    };
  }

  const sav = savInfo(message);
  if (sav) {
    return {
      content: `${sav}\n\n${MEDICAL_DISCLAIMER}`,
      suggestions: ["Nos magasins", "Voir le matériel"],
      products: [],
    };
  }

  const products = await loadCatalog();
  let profile = userId ? (await getVapeProfile(userId)) ?? emptyVapeProfile() : emptyVapeProfile();

  if (userId) {
    const updates = extractProfileUpdates(message);
    if (Object.keys(updates).length > 0) {
      profile = mergeProfileUpdates(profile, updates);
      await upsertVapeProfile(userId, { ...profile, gdprConsent: profile.gdprConsent || true, personalizedEnabled: true });
    }
  }

  let picks: CatalogProduct[] = [];
  let intro = "";
  let reason = "sélection A.V.A.";

  if (/promo|promotion|solde|offre/i.test(text)) {
    picks = searchCatalog(products, message, { promoOnly: true, limit: 4 });
    intro = "Voici nos promotions du moment — des opportunités à saisir chez All Vap's :";
    reason = "promotion en cours";
  } else if (/nouveaut|nouveau|new/i.test(text)) {
    picks = searchCatalog(products, message, { newOnly: true, limit: 4 });
    intro = "Découvrez nos dernières nouveautés sélectionnées pour vous :";
    reason = "nouveauté";
  } else if (/résistance|resistance|coil|mesh/i.test(text)) {
    picks = searchCatalog(products, message, { category: "resistance", limit: 4 });
    if (picks.length === 0) picks = searchCatalog(products, "résistance coil", { limit: 4 });
    intro = "J'ai identifié ces résistances compatibles avec votre demande :";
    reason = "résistance compatible";
  } else if (/accu|batterie|18650|21700/i.test(text)) {
    picks = searchCatalog(products, message, { category: "accu", limit: 4 });
    intro = "Sélection d'accus et batteries recommandés par nos experts :";
    reason = "accu / batterie";
  } else if (/chargeur/i.test(text)) {
    picks = searchCatalog(products, message, { limit: 4 });
    intro = "Voici nos chargeurs disponibles :";
    reason = "chargeur";
  } else if (/diy|base|ar[ôo]me/i.test(text)) {
    picks = searchCatalog(products, message, { category: "diy", limit: 4 });
    intro = "Matériel DIY pour créer vos propres e-liquides :";
    reason = "DIY";
  } else if (/d[ée]but|commenc|premier|kit|starter|nouveau vapoteur/i.test(text)) {
    picks = searchCatalog(products, "kit pod starter cigarette débutant", { limit: 4 });
    intro =
      "Parfait pour débuter ! Je vous recommande un kit complet, simple et fiable. En boutique, nous vous accompagnons pas à pas :";
    reason = "idéal débutant";
  } else if (/arr[êe]t|fumer|sevrage|cigarette/i.test(text)) {
    picks = searchCatalog(products, "pod kit MTL nicotine", { limit: 3 });
    intro =
      "Bravo pour votre démarche. Un kit pod MTL avec un taux de nicotine adapté peut vous accompagner progressivement. Ce n'est pas un traitement médical — nos conseillers en boutique personnalisent votre accompagnement :";
    reason = "accompagnement sevrage";
  } else if (/fruit|liquide|e-liquid|eliquide|saveur|gourmand|menthol|classic/i.test(text)) {
    if (userId && profile.gdprConsent) {
      picks = recommendForProfile(products, profile, 4);
      reason = "selon votre profil";
    }
    if (picks.length === 0) picks = searchCatalog(products, message, { limit: 4 });
    intro = "Excellente question ! Voici des e-liquides qui correspondent à votre recherche :";
    reason = picks.length ? reason : "saveur recherchée";
  } else if (/pod|cigarette|box|mod|mat[ée]riel/i.test(text)) {
    picks = searchCatalog(products, message, { limit: 4 });
    intro = "Voici le matériel que je vous suggère :";
    reason = "matériel adapté";
  } else if (userId && profile.gdprConsent) {
    const recs = getPersonalizedRecommendations(products, profile, { limit: 3 });
    if (recs.length > 0) {
      picks = recs.map((r) => ({ ...r.product, imageUrl: (r.product as CatalogProduct).imageUrl ?? null }));
      intro = "D'après votre profil vape, voici mes recommandations personnalisées :";
      reason = "profil personnalisé";
    }
  }

  if (picks.length === 0) {
    picks = searchCatalog(products, message, { limit: 3 });
  }

  if (picks.length === 0 && /voir la nouveaut/i.test(text) && userId) {
    const recs = getPersonalizedRecommendations(products, profile, { limit: 1, newOnly: true });
    if (recs.length) {
      picks = recs.map((r) => ({ ...r.product, imageUrl: (r.product as CatalogProduct).imageUrl ?? null }));
      intro = "Voici la nouveauté que j'avais repérée pour vous :";
      reason = "nouveauté personnalisée";
    }
  }

  if (picks.length > 0) {
    if (userId) {
      for (const p of picks.slice(0, 3)) {
        await addRecommendation(userId, p.id, reason, 1, "ava");
      }
    }

    const cards = picks.map((p) => toCard(p, reason));
    const names = picks.map((p) => p.name).join(", ");

    return {
      content: `${intro || "Voici ma sélection All Vap's :"}\n\n${names}\n\n${MEDICAL_DISCLAIMER}`,
      suggestions: picks.slice(0, 3).map((p) => p.name).concat(["Autre recherche", "Nos magasins"]),
      products: cards,
      speaking: true,
    };
  }

  return {
    content:
      "Je suis A.V.A., experte en cigarettes électroniques, e-liquides, pods, résistances, accus, chargeurs, DIY et accessoires. Décrivez votre besoin (saveur, matériel, budget…) et je vous guide. " +
      MEDICAL_DISCLAIMER,
    suggestions: AVA_SUGGESTIONS,
    products: [],
  };
}
