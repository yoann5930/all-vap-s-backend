/**
 * Tests offre E-Tasty One Taste 10 ml — éligibilité stricte + paliers officiels.
 * Run: npx tsx scripts/test-promo-10ml.ts
 */
import {
  isPromo10mlEligible,
  calculatePromo10ml,
  whyNotPromo10mlEligible,
  quoteTenMlPaidQuantity,
  type Promo10mlCartLine,
} from "../lib/promotions/promo-10ml";
import { applyCartPromos } from "../lib/promotions/cart-promos";
import { quoteTwentyPaidQuantity } from "../lib/promotions/promo-twenty";
import { isTenMlOfferQuestion, isShopOfferQuestion } from "../lib/ava/shop-offers";

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

const OT = {
  category: "05.E-liquide 10ml",
  productType: "10ml" as const,
  volumeMl: 10,
  productFamily: "ETASTY_ONE_TASTE",
  rangeSlug: "one-taste",
  range: "One Taste",
  brand: "e.Tasty",
};

function otLine(
  id: string,
  name: string,
  quantity: number,
  unitPriceCents = 690
): Promo10mlCartLine {
  return {
    productId: id,
    name,
    quantity,
    unitPriceCents,
    ...OT,
  };
}

assert(
  isPromo10mlEligible({
    ...OT,
    name: "Ananas 10ml 0mg e-tasty",
    visibleOnline: true,
    isActive: true,
    catalogStatus: "valide",
    stock: 5,
  }),
  "One Taste 10 ml éligible"
);

assert(
  !isPromo10mlEligible({
    category: "05.E-liquide 10ml",
    volumeMl: 10,
    productType: "10ml",
    name: "Ice Cool Menthe 10ml",
    brand: "Liquidarom",
    visibleOnline: true,
    isActive: true,
    catalogStatus: "valide",
    stock: 5,
  }),
  "10 ml autre marque non éligible"
);

assert(
  !isPromo10mlEligible({
    ...OT,
    name: "ONE Taste - Ananas 50ml",
    volumeMl: 50,
    productType: "50ml",
    visibleOnline: true,
    isActive: true,
    catalogStatus: "valide",
    stock: 5,
  }),
  "One Taste 50 ml jamais éligible"
);

assert(
  !isPromo10mlEligible({
    name: "Twenty Double Pêche",
    brand: "e.Tasty",
    range: "Twenty",
    rangeSlug: "twenty",
    productFamily: "ETASTY_TWENTY",
    category: "E-liquides",
    volumeMl: 20,
    productType: "20ml",
    visibleOnline: true,
    isActive: true,
    catalogStatus: "valide",
    stock: 5,
  }),
  "Twenty 20 ml hors offre One Taste"
);

assert(
  !isPromo10mlEligible({
    category: "Pods",
    volumeMl: 10,
    productType: "10ml",
    name: "Pod 10ml",
    visibleOnline: true,
    isActive: true,
    catalogStatus: "valide",
    stock: 5,
  }),
  "pods exclus"
);

assert(
  whyNotPromo10mlEligible({
    category: "05.E-liquide 10ml",
    volumeMl: 10,
    name: "Ananas 10ml",
  }) === "pas_one_taste",
  "motif exclusion hors One Taste"
);

assert(quoteTenMlPaidQuantity(1).payCents === 690 && quoteTenMlPaidQuantity(1).freeExtra === 0, "1 → 6,90");
assert(quoteTenMlPaidQuantity(2).payCents === 1180 && quoteTenMlPaidQuantity(2).unitCents === 590, "2 → 11,80");
assert(quoteTenMlPaidQuantity(3).payCents === 1470, "3 → 14,70");
assert(quoteTenMlPaidQuantity(4).payCents === 1560 && quoteTenMlPaidQuantity(4).freeExtra === 0, "4 → 15,60");
assert(quoteTenMlPaidQuantity(5).payCents === 2450 && quoteTenMlPaidQuantity(5).freeExtra === 1, "5 → 24,50 +1");
assert(quoteTenMlPaidQuantity(6).payCents === 2940 && quoteTenMlPaidQuantity(6).freeExtra === 2, "6 → 29,40 +2");
assert(quoteTenMlPaidQuantity(7).payCents === 3430 && quoteTenMlPaidQuantity(7).freeExtra === 3, "7 → 34,30 +3");
assert(quoteTenMlPaidQuantity(8).payCents === 3920 && quoteTenMlPaidQuantity(8).freeExtra === 4, "8 → 39,20 +4");
assert(quoteTenMlPaidQuantity(9).payCents === 4410 && quoteTenMlPaidQuantity(9).freeExtra === 5, "9 → 44,10 +5");
assert(quoteTenMlPaidQuantity(10).payCents === 4900 && quoteTenMlPaidQuantity(10).freeExtra === 6, "10 → 49,00 +6");
assert(quoteTenMlPaidQuantity(12).freeExtra === 6, "12 → pack 10+6 + palier 2 (0 extra palier 2)");
assert(quoteTenMlPaidQuantity(12).payCents === 4900 + 1180, "12 → 10×4,90 + 2×5,90");

for (const qty of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const) {
  const r = calculatePromo10ml([otLine("ot", "Ananas 10ml One Taste", qty)]);
  const q = quoteTenMlPaidQuantity(qty);
  assert(r.eligibleQuantity === qty, `panier ${qty} eligible=${qty}`);
  assert(r.payCents === q.payCents, `panier ${qty} payCents=${q.payCents}`);
  assert(r.freeExtra === q.freeExtra, `panier ${qty} extras=${q.freeExtra}`);
  assert(
    r.extras.reduce((s, e) => s + e.quantity, 0) === q.freeExtra,
    `panier ${qty} extras alloués`
  );
}

const mix = [
  otLine("a", "Ananas 10ml", 3),
  {
    productId: "b",
    name: "Ice Cool 50ml",
    quantity: 2,
    unitPriceCents: 2090,
    category: "06.E-liquide 50ml",
    productType: "50ml",
    volumeMl: 50,
  },
];
const r1 = calculatePromo10ml(mix);
assert(r1.eligibleQuantity === 3, "eligible=3 (ignore 50ml)");
assert(r1.ignoredQuantity === 2, "ignored=2 (50ml)");
assert(r1.freeExtra === 0, "pas d'offert avec 3");
assert(r1.payCents === 1470, "3 × 4,90");

const other10 = calculatePromo10ml([
  {
    productId: "x",
    name: "Menthe 10ml Liquidarom",
    quantity: 7,
    unitPriceCents: 690,
    category: "05.E-liquide 10ml",
    productType: "10ml",
    volumeMl: 10,
    brand: "Liquidarom",
  },
]);
assert(other10.eligibleQuantity === 0, "autre marque 10 ml ignorée");
assert(other10.payCents === 0, "autre marque 10 ml non facturée en offre");

const sevenOtPlusFourTwenty = applyCartPromos([
  {
    productId: "ot1",
    name: "One Taste Ananas 10ml",
    priceCents: 690,
    quantity: 7,
    ...OT,
  },
  {
    productId: "tw1",
    name: "Twenty Double Pêche 20ml",
    priceCents: 1290,
    quantity: 4,
    category: "E-liquides",
    productType: "20ml",
    volumeMl: 20,
    brand: "e.Tasty",
    range: "Twenty",
    rangeSlug: "twenty",
    productFamily: "ETASTY_TWENTY",
  },
]);
assert(sevenOtPlusFourTwenty.promo10.eligibleQuantity === 7, "scénario 7 One Taste");
assert(sevenOtPlusFourTwenty.promo10.payCents === 3430, "7 × 4,90 = 34,30");
assert(sevenOtPlusFourTwenty.promo10.freeExtra === 3, "7 One Taste → +3 offerts");
assert(sevenOtPlusFourTwenty.twenty.eligibleQuantity === 4, "scénario 4 Twenty");
assert(sevenOtPlusFourTwenty.twenty.payCents === quoteTwentyPaidQuantity(4).payCents, "Twenty 4 inchangé");
assert(sevenOtPlusFourTwenty.twenty.freeExtra === 0, "Twenty 4 sans offert");
assert(
  sevenOtPlusFourTwenty.totalCents === 3430 + quoteTwentyPaidQuantity(4).payCents,
  "coexistence totaux 7 OT + 4 Twenty"
);

assert(isTenMlOfferQuestion("Quelle est l'offre 10 ml ?"), "AVA détecte offre 10 ml");
assert(isTenMlOfferQuestion("Offre One Taste ?"), "AVA détecte One Taste");
assert(isShopOfferQuestion("5+1 sur les 10 ml"), "AVA détecte 5+1 10 ml");
assert(!isTenMlOfferQuestion("Je cherche un liquide fruité"), "pas d'interception fruité");

console.log(`\n${passed} OK / ${failed} FAIL`);
process.exit(failed > 0 ? 1 : 0);
