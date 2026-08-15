/**
 * Tests offre 10 ml dégressive — éligibilité stricte + paliers.
 * Run: npx tsx scripts/test-promo-10ml.ts
 */
import {
  isPromo10mlEligible,
  calculatePromo10ml,
  whyNotPromo10mlEligible,
  quoteTenMlPaidQuantity,
  type Promo10mlCartLine,
} from "../lib/promotions/promo-10ml";
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

assert(
  isPromo10mlEligible({
    category: "05.E-liquide 10ml",
    volumeMl: 10,
    productType: "10ml",
    visibleOnline: true,
    isActive: true,
    catalogStatus: "valide",
    stock: 5,
  }),
  "10ml e-liquide éligible sans flag"
);

assert(
  !isPromo10mlEligible({
    category: "06.E-liquide 50ml",
    volumeMl: 50,
    productType: "50ml",
    promotion10mlEligible: true,
    visibleOnline: true,
    isActive: true,
    catalogStatus: "valide",
    stock: 5,
  }),
  "50ml jamais éligible même si flag true"
);

assert(
  !isPromo10mlEligible({
    category: "05.E-liquide 10ml",
    volumeMl: 100,
    productType: "100ml",
    visibleOnline: true,
    isActive: true,
    catalogStatus: "valide",
    stock: 5,
  }),
  "100ml jamais éligible"
);

assert(
  !isPromo10mlEligible({
    category: "Pods",
    volumeMl: 10,
    productType: "10ml",
    visibleOnline: true,
    isActive: true,
    catalogStatus: "valide",
    stock: 5,
  }),
  "pods exclus"
);

assert(
  !isPromo10mlEligible({
    category: "18.DIY",
    volumeMl: 10,
    productType: "10ml",
    visibleOnline: true,
    isActive: true,
    catalogStatus: "valide",
    stock: 5,
  }),
  "DIY exclus"
);

assert(
  whyNotPromo10mlEligible({
    category: "06.E-liquide 50ml",
    volumeMl: 50,
  })?.includes("volumeMl=50") === true,
  "motif exclusion volume"
);

assert(quoteTenMlPaidQuantity(1).payCents === 690 && quoteTenMlPaidQuantity(1).freeExtra === 0, "1 → 6,90");
assert(quoteTenMlPaidQuantity(2).payCents === 1180 && quoteTenMlPaidQuantity(2).unitCents === 590, "2 → 5,90");
assert(quoteTenMlPaidQuantity(3).payCents === 1470, "3 → 4,90");
assert(quoteTenMlPaidQuantity(4).payCents === 1560 && quoteTenMlPaidQuantity(4).freeExtra === 0, "4 → 3,90");
assert(quoteTenMlPaidQuantity(5).payCents === 1950 && quoteTenMlPaidQuantity(5).freeExtra === 1, "5+1");
assert(quoteTenMlPaidQuantity(6).payCents === 2340 && quoteTenMlPaidQuantity(6).freeExtra === 2, "6+2");
assert(quoteTenMlPaidQuantity(10).payCents === 3900 && quoteTenMlPaidQuantity(10).freeExtra === 6, "10+6");
assert(quoteTenMlPaidQuantity(12).freeExtra === 6, "12 → pack 10+6 + palier 2");
assert(quoteTenMlPaidQuantity(12).payCents === 3900 + 1180, "12 → 10×3,90 + 2×5,90");

const mix: Promo10mlCartLine[] = [
  {
    productId: "a",
    name: "Ananas 10ml",
    quantity: 3,
    unitPriceCents: 690,
    category: "05.E-liquide 10ml",
    productType: "10ml",
    volumeMl: 10,
  },
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
assert(r1.discountCents === 3 * 690 - 1470, "remise palier 3");

const six: Promo10mlCartLine[] = [
  {
    productId: "c1",
    name: "A 10ml",
    quantity: 2,
    unitPriceCents: 590,
    category: "05.E-liquide 10ml",
    productType: "10ml",
    volumeMl: 10,
  },
  {
    productId: "c2",
    name: "B 10ml",
    quantity: 4,
    unitPriceCents: 690,
    category: "05.E-liquide 10ml",
    productType: "10ml",
    volumeMl: 10,
  },
];
const r2 = calculatePromo10ml(six);
assert(r2.eligibleQuantity === 6, "6 unités 10ml");
assert(r2.freeExtra === 2, "6+2 offerts en plus");
assert(r2.payCents === 2340, "6 × 3,90");
assert(r2.discountCents === 2 * 590 + 4 * 690 - 2340, "remise 6 flacons");
assert(r2.extras.reduce((s, e) => s + e.quantity, 0) === 2, "2 extras alloués");

const twelve: Promo10mlCartLine[] = [
  {
    productId: "d",
    name: "C 10ml",
    quantity: 12,
    unitPriceCents: 690,
    category: "05.E-liquide 10ml",
    productType: "10ml",
    volumeMl: 10,
  },
];
const r3 = calculatePromo10ml(twelve);
assert(r3.freeExtra === 6, "12 → 6 offerts (pack 10+6)");
assert(r3.payCents === 5080, "12 payés au palier pack+reste");

assert(
  !isPromo10mlEligible({
    category: "05.E-liquide 10ml",
    volumeMl: 20,
    productType: "20ml",
    visibleOnline: true,
    isActive: true,
    catalogStatus: "valide",
    stock: 5,
  }),
  "20ml Twenty hors offre 10 ml"
);

assert(isTenMlOfferQuestion("Quelle est l'offre 10 ml ?"), "AVA détecte offre 10 ml");
assert(isShopOfferQuestion("5+1 sur les 10 ml"), "AVA détecte 5+1 10 ml");
assert(!isTenMlOfferQuestion("Je cherche un liquide fruité"), "pas d'interception fruité");

console.log(`\n${passed} OK / ${failed} FAIL`);
process.exit(failed > 0 ? 1 : 0);
