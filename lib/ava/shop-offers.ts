/**
 * Offres boutique connues d'A.V.A. — vérification avant paiement.
 * Pas d'invention de prix : paliers figés + recalcul panier.
 */
import {
  calculatePromoTwenty,
  twentyOfferFaqAnswer,
  twentyTiersForDisplay,
  type PromoTwentyCartLine,
  type PromoTwentyResult,
} from "@/lib/promotions/promo-twenty";
import {
  calculatePromo10ml,
  tenMlOfferFaqAnswer,
  tenMlTiersForDisplay,
  type Promo10mlCartLine,
  type Promo10mlResult,
} from "@/lib/promotions/promo-10ml";

function normOfferText(message: string): string {
  return message
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, " ");
}

export function isTenMlOfferQuestion(message: string): boolean {
  const t = normOfferText(message);
  if (/one\s*taste/.test(t) && /offre|promo|palier|degress|prix|panier|10\s*ml/.test(t)) {
    return true;
  }
  if (/\b10\s*ml\b/.test(t) && /offre|promo|palier|degress|prix|panier|paye|paiement|5\s*\+\s*1|10\s*\+\s*6/.test(t)) {
    return true;
  }
  return /offre\s+10|10\s*ml\s+degress|5\s*\+\s*1/.test(t);
}

export function isTwentyOfferQuestion(message: string): boolean {
  const t = normOfferText(message);
  if (/\btwenty\b/.test(t) && /offre|promo| palier|degress|prix|panier|paye|paiement|combien/.test(t)) {
    return true;
  }
  return /offre\s+twenty|twenty\s+degress|5\s+twenty|lot\s+twenty/.test(t);
}

export function isShopOfferQuestion(message: string): boolean {
  const t = normOfferText(message);
  if (isTenMlOfferQuestion(message) || isTwentyOfferQuestion(message)) return true;
  if (/verif(ie|ier).*(offre|panier|paiement)|avant\s+pay/.test(t) && /twenty|10\s*ml|panier/.test(t)) {
    return true;
  }
  return /\boffre degressive\b|\bdegressive twenty\b|\boffres boutique\b/.test(t);
}

export function formatTenMlOfferKnowledge(): string {
  const rows = tenMlTiersForDisplay()
    .map((r) => `• ${r.qty} flacon(s) 10 ml : ${r.unitLabel} / unité${r.extraLabel !== "—" ? ` ${r.extraLabel}` : ""}`)
    .join("\n");
  return [
    tenMlOfferFaqAnswer(),
    "",
    "Paliers :",
    rows,
    "",
    "Avant paiement je recalcule le panier : E-Tasty One Taste 10 ml uniquement, flacons offerts livrés en plus à partir de 5 (5+1 jusqu'à 10+6).",
  ].join("\n");
}

export function formatTwentyOfferKnowledge(): string {
  const rows = twentyTiersForDisplay()
    .map((r) => `• ${r.qty} Twenty : ${r.unitLabel} / unité${r.extraLabel !== "—" ? ` ${r.extraLabel}` : ""}`)
    .join("\n");
  return [
    twentyOfferFaqAnswer(),
    "",
    "Paliers :",
    rows,
    "",
    "Avant paiement je recalcule le panier : saveurs Twenty cumulées, prix catalogue 12,90 € inchangé, flacons offerts livrés en plus à partir de 6.",
  ].join("\n");
}

export function formatShopOffersKnowledge(message?: string): string {
  const ten = message ? isTenMlOfferQuestion(message) : false;
  const twenty = message ? isTwentyOfferQuestion(message) : false;
  if (ten && !twenty) return formatTenMlOfferKnowledge();
  if (twenty && !ten) return formatTwentyOfferKnowledge();
  return [formatTenMlOfferKnowledge(), "", formatTwentyOfferKnowledge()].join("\n");
}

export function formatAvaCheckoutVerification(params: {
  twenty: PromoTwentyResult;
  promo10: Promo10mlResult;
  totalCents: number;
}): string {
  const parts: string[] = [];
  if (params.twenty.eligibleQuantity > 0) {
    parts.push(params.twenty.avaSummary);
  }
  if (params.promo10.eligibleQuantity > 0) {
    parts.push(params.promo10.avaSummary);
  }
  if (!parts.length) {
    return "A.V.A. : aucune offre Twenty ou One Taste 10 ml à appliquer sur ce panier. Le total correspond aux prix catalogue.";
  }
  parts.push(`Total articles après offres (hors livraison) : ${(params.totalCents / 100).toFixed(2).replace(".", ",")} €.`);
  return parts.join(" ");
}

export function verifyTwentyOfferOnCart(lines: PromoTwentyCartLine[]): {
  twenty: PromoTwentyResult;
  knowledge: string;
  avaMessage: string;
} {
  const twenty = calculatePromoTwenty(lines);
  return {
    twenty,
    knowledge: formatTwentyOfferKnowledge(),
    avaMessage: twenty.avaSummary,
  };
}

export function verifyCheckoutOffers(params: {
  twentyLines: PromoTwentyCartLine[];
  promo10Lines: Promo10mlCartLine[];
  subtotalCents: number;
}): {
  twenty: PromoTwentyResult;
  promo10: Promo10mlResult;
  avaMessage: string;
  discountCents: number;
  totalCents: number;
} {
  const twenty = calculatePromoTwenty(params.twentyLines);
  const promo10 = calculatePromo10ml(params.promo10Lines);
  const discountCents = Math.min(
    twenty.discountCents + promo10.discountCents,
    Math.max(0, params.subtotalCents)
  );
  const totalCents = Math.max(0, params.subtotalCents - discountCents);
  return {
    twenty,
    promo10,
    discountCents,
    totalCents,
    avaMessage: formatAvaCheckoutVerification({
      twenty,
      promo10,
      totalCents,
    }),
  };
}
