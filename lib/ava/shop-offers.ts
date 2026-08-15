/**
 * Offres boutique connues d'A.V.A. — vérification avant paiement.
 * Pas d'invention de prix : paliers Twenty figés + recalcul panier.
 */
import {
  calculatePromoTwenty,
  twentyOfferFaqAnswer,
  twentyTiersForDisplay,
  type PromoTwentyCartLine,
  type PromoTwentyResult,
} from "@/lib/promotions/promo-twenty";
import { calculatePromo10ml, type Promo10mlCartLine } from "@/lib/promotions/promo-10ml";

export function isShopOfferQuestion(message: string): boolean {
  const t = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, " ");
  if (/\btwenty\b/.test(t) && /offre|promo| palier|degress|prix|panier|paye|paiement|combien/.test(t)) {
    return true;
  }
  if (/offre\s+twenty|twenty\s+degress|5\s+twenty|lot\s+twenty/.test(t)) return true;
  if (/verif(ie|ier).*(offre|panier|paiement)|avant\s+pay/.test(t) && /twenty|10\s*ml|panier/.test(t)) {
    return true;
  }
  return /\boffre degressive\b|\bdegressive twenty\b/.test(t);
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

export function formatAvaCheckoutVerification(params: {
  twenty: PromoTwentyResult;
  promo10Label?: string | null;
  promo10DiscountCents?: number;
  totalCents: number;
}): string {
  const parts: string[] = [];
  if (params.twenty.eligibleQuantity > 0) {
    parts.push(params.twenty.avaSummary);
  }
  if ((params.promo10DiscountCents || 0) > 0 && params.promo10Label) {
    parts.push(`Offre 10 ml aussi appliquée : ${params.promo10Label}.`);
  }
  if (!parts.length) {
    return "A.V.A. : aucune offre Twenty ou 10 ml à appliquer sur ce panier. Le total correspond aux prix catalogue.";
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
    discountCents,
    totalCents,
    avaMessage: formatAvaCheckoutVerification({
      twenty,
      promo10Label: promo10.label,
      promo10DiscountCents: promo10.discountCents,
      totalCents,
    }),
  };
}
