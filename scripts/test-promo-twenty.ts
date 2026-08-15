/**
 * Tests offre dégressive Twenty — paliers + mix saveurs + exclusion 10/50 ml.
 * Run: npx tsx scripts/test-promo-twenty.ts
 */
import {
  isPromoTwentyEligible,
  calculatePromoTwenty,
  quoteTwentyPaidQuantity,
  whyNotPromoTwentyEligible,
  type PromoTwentyCartLine,
} from "../lib/promotions/promo-twenty";
import { isPromo10mlEligible } from "../lib/promotions/promo-10ml";
import { applyCartPromos } from "../lib/promotions/cart-promos";
import { isShopOfferQuestion } from "../lib/ava/shop-offers";

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string) {
  if (cond) {
    passed++;
    console.log("OK ", label);
  } else {
    failed++;
    console.error("FAIL", label);
  }
}

function twentyLine(
  partial: Partial<PromoTwentyCartLine> & { quantity: number; unitPriceCents?: number }
): PromoTwentyCartLine {
  return {
    productId: partial.productId || "t1",
    name: partial.name || "Twenty double pêche",
    quantity: partial.quantity,
    unitPriceCents: partial.unitPriceCents ?? 1290,
    category: "E-liquides",
    productType: "20ml",
    volumeMl: 20,
    brand: "e.Tasty",
    range: "Twenty",
    rangeSlug: "twenty",
    productFamily: "ETASTY_TWENTY",
    ...partial,
  };
}

assert(
  isPromoTwentyEligible({
    name: "Twenty double pêche",
    productFamily: "ETASTY_TWENTY",
    volumeMl: 20,
    productType: "20ml",
    visibleOnline: true,
    isActive: true,
    catalogStatus: "valide",
    stock: 4,
  }),
  "Twenty 20ml éligible"
);

assert(
  !isPromoTwentyEligible({
    name: "Ice Cool Ananas 10ml",
    volumeMl: 10,
    productType: "10ml",
    rangeSlug: "ice-cool",
    visibleOnline: true,
    isActive: true,
    catalogStatus: "valide",
    stock: 4,
  }),
  "10ml hors Twenty"
);

assert(
  !isPromoTwentyEligible({
    name: "Twenty double pêche",
    productFamily: "ETASTY_TWENTY",
    volumeMl: 50,
    productType: "50ml",
    visibleOnline: true,
    isActive: true,
    catalogStatus: "valide",
    stock: 4,
  }),
  "Twenty 50ml refusé"
);

assert(
  !isPromo10mlEligible({
    category: "E-liquides",
    volumeMl: 20,
    productType: "20ml",
    promotion10mlEligible: true,
    visibleOnline: true,
    isActive: true,
    catalogStatus: "valide",
    stock: 5,
  }),
  "promo 10ml refuse 20ml"
);

assert(quoteTwentyPaidQuantity(1).payCents === 1290, "1 → 12,90");
assert(quoteTwentyPaidQuantity(2).payCents === 2380, "2 → 11,90 × 2");
assert(quoteTwentyPaidQuantity(3).payCents === 3270, "3 → 10,90 × 3");
assert(quoteTwentyPaidQuantity(4).payCents === 3960, "4 → 9,90 × 4");
assert(quoteTwentyPaidQuantity(5).payCents === 3950, "5 → 7,90 × 5");
assert(quoteTwentyPaidQuantity(5).freeExtra === 0, "5 sans offert");
assert(quoteTwentyPaidQuantity(6).payCents === 5340, "6 → 8,90 × 6");
assert(quoteTwentyPaidQuantity(6).freeExtra === 1, "6 → +1 offert");
assert(quoteTwentyPaidQuantity(7).freeExtra === 2, "7 → +2 offerts");
assert(quoteTwentyPaidQuantity(8).freeExtra === 3, "8 → +3 offerts");
assert(quoteTwentyPaidQuantity(9).freeExtra === 4, "9 → +4 offerts");
assert(quoteTwentyPaidQuantity(10).payCents === 8900, "10 → 8,90 × 10");
assert(quoteTwentyPaidQuantity(10).freeExtra === 5, "10 → +5 offerts");
assert(quoteTwentyPaidQuantity(11).payCents === 8900 + 1290, "11 → pack 10 + 1");
assert(quoteTwentyPaidQuantity(11).freeExtra === 5, "11 → 5 offerts (pack 10)");
assert(quoteTwentyPaidQuantity(16).payCents === 8900 + 5340, "16 → pack 10 + 6");
assert(quoteTwentyPaidQuantity(16).freeExtra === 6, "16 → 5+1 offerts");

const mix: PromoTwentyCartLine[] = [
  twentyLine({ productId: "peche", name: "Twenty double pêche", quantity: 2 }),
  twentyLine({
    productId: "menthe",
    name: "Twenty. Menthe polaire",
    quantity: 1,
  }),
  {
    productId: "ic",
    name: "Ice Cool 50ml",
    quantity: 2,
    unitPriceCents: 2090,
    category: "E-liquides",
    productType: "50ml",
    volumeMl: 50,
    rangeSlug: "ice-cool",
  },
];
const rMix = calculatePromoTwenty(mix);
assert(rMix.eligibleQuantity === 3, "mix : 3 Twenty");
assert(rMix.payCents === 3270, "mix 3 → 10,90 × 3");
assert(rMix.discountCents === 3 * 1290 - 3270, "remise vs 12,90");
assert(rMix.freeExtra === 0, "3 sans offert");

const six = calculatePromoTwenty([twentyLine({ quantity: 6 })]);
assert(six.payCents === 5340, "6 payés 53,40");
assert(six.freeExtra === 1, "6 → 1 extra");
assert(six.extras.reduce((s, e) => s + e.quantity, 0) === 1, "1 ligne extra");
assert(six.discountCents === 6 * 1290 - 5340, "remise 6");

const five = calculatePromoTwenty([twentyLine({ quantity: 5 })]);
assert(five.payCents === 3950, "5 moins cher que 4");
assert(five.payCents < quoteTwentyPaidQuantity(4).payCents, "5 < 4 en total");

const notTwenty = calculatePromoTwenty([
  {
    productId: "x",
    name: "One Taste Pêche 10ml",
    quantity: 6,
    unitPriceCents: 550,
    volumeMl: 10,
    productType: "10ml",
    rangeSlug: "one-taste",
  },
]);
assert(notTwenty.eligibleQuantity === 0, "One Taste ignoré");
assert(whyNotPromoTwentyEligible({ name: "One Taste", volumeMl: 10 }) === "pas_twenty", "motif pas_twenty");

const cart = applyCartPromos([
  {
    productId: "t",
    name: "Twenty fruits rouges",
    priceCents: 1290,
    quantity: 6,
    volumeMl: 20,
    productType: "20ml",
    productFamily: "ETASTY_TWENTY",
    rangeSlug: "twenty",
  },
]);
assert(cart.twenty.freeExtra === 1, "cart-promos freeExtra");
assert(cart.totalCents === 5340, "cart-promos total 6 Twenty");
assert(cart.promo10.discountCents === 0, "pas de 10ml sur Twenty");

assert(
  isShopOfferQuestion("Peux-tu vérifier l'offre Twenty avant paiement ?"),
  "AVA détecte vérif offre Twenty"
);
assert(!isShopOfferQuestion("Je cherche un liquide fruité"), "AVA n'intercepte pas un fruité générique");

console.log(`\n${passed} OK / ${failed} FAIL`);
process.exit(failed > 0 ? 1 : 0);
