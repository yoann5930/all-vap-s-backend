/**
 * Remises panier cumulées (10 ml dégressive + Twenty dégressive).
 * Les deux offres ne se recouvrent pas (10 ml vs 20 ml Twenty).
 */
import {
  calculatePromo10ml,
  type Promo10mlCartLine,
  type Promo10mlResult,
} from "@/lib/promotions/promo-10ml";
import {
  calculatePromoTwenty,
  type PromoTwentyCartLine,
  type PromoTwentyResult,
} from "@/lib/promotions/promo-twenty";

export interface CartPromoItem {
  productId: string;
  variantId?: string | null;
  name: string;
  priceCents: number;
  quantity: number;
  category?: string | null;
  productType?: string | null;
  volumeMl?: number | null;
  promotion10mlEligible?: boolean | null;
  brand?: string | null;
  range?: string | null;
  rangeSlug?: string | null;
  productFamily?: string | null;
}

export function toPromo10mlLines(items: CartPromoItem[]): Promo10mlCartLine[] {
  return items.map((item) => ({
    productId: item.productId,
    variantId: item.variantId,
    name: item.name,
    quantity: item.quantity,
    unitPriceCents: item.priceCents,
    category: item.category,
    productType: item.productType,
    volumeMl: item.volumeMl,
    promotion10mlEligible: item.promotion10mlEligible,
    brand: item.brand,
    range: item.range,
    rangeSlug: item.rangeSlug,
    productFamily: item.productFamily,
    availableQuantity: item.quantity,
  }));
}

export function toPromoTwentyLines(items: CartPromoItem[]): PromoTwentyCartLine[] {
  return items.map((item) => ({
    productId: item.productId,
    variantId: item.variantId,
    name: item.name,
    quantity: item.quantity,
    unitPriceCents: item.priceCents,
    category: item.category,
    productType: item.productType,
    volumeMl: item.volumeMl,
    brand: item.brand,
    range: item.range,
    rangeSlug: item.rangeSlug,
    productFamily: item.productFamily,
    availableQuantity: item.quantity,
  }));
}

export interface CartPromosResult {
  subtotalCents: number;
  promo10: Promo10mlResult;
  twenty: PromoTwentyResult;
  discountCents: number;
  totalCents: number;
}

export function applyCartPromos(items: CartPromoItem[]): CartPromosResult {
  const subtotalCents = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
  const promo10 = calculatePromo10ml(toPromo10mlLines(items));
  const twenty = calculatePromoTwenty(toPromoTwentyLines(items));
  const discountCents = Math.min(
    promo10.discountCents + twenty.discountCents,
    Math.max(0, subtotalCents)
  );
  return {
    subtotalCents,
    promo10,
    twenty,
    discountCents,
    totalCents: Math.max(0, subtotalCents - discountCents),
  };
}
