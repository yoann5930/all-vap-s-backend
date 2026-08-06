/**
 * Tests offre 10 ml — éligibilité stricte + calcul paliers.
 * Run: npx tsx scripts/test-promo-10ml.ts
 */
import {
  isPromo10mlEligible,
  calculatePromo10ml,
  whyNotPromo10mlEligible,
  type Promo10mlCartLine,
} from "../lib/promotions/promo-10ml";

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

// Éligibilité
assert(
  isPromo10mlEligible({
    category: "05.E-liquide 10ml",
    volumeMl: 10,
    productType: "10ml",
    promotion10mlEligible: true,
    visibleOnline: true,
    isActive: true,
    catalogStatus: "valide",
    stock: 5,
  }),
  "10ml e-liquide éligible"
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
    promotion10mlEligible: true,
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
    promotion10mlEligible: true,
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
    promotion10mlEligible: true,
    visibleOnline: true,
    isActive: true,
    catalogStatus: "valide",
    stock: 5,
  }),
  "DIY exclus"
);

assert(
  !isPromo10mlEligible({
    category: "05.E-liquide 10ml",
    volumeMl: 10,
    productType: "10ml",
    promotion10mlEligible: false,
    visibleOnline: true,
    isActive: true,
    catalogStatus: "valide",
    stock: 5,
  }),
  "flag false → exclus"
);

assert(
  whyNotPromo10mlEligible({
    category: "06.E-liquide 50ml",
    volumeMl: 50,
    promotion10mlEligible: true,
  })?.includes("volumeMl=50") === true,
  "motif exclusion volume"
);

// Calcul panier : 3×10ml + 2×50ml → palier sur 3 seulement
const mix: Promo10mlCartLine[] = [
  {
    productId: "a",
    name: "Ananas 10ml",
    quantity: 3,
    unitPriceCents: 690,
    category: "05.E-liquide 10ml",
    productType: "10ml",
    volumeMl: 10,
    promotion10mlEligible: true,
  },
  {
    productId: "b",
    name: "Ice Cool 50ml",
    quantity: 2,
    unitPriceCents: 2090,
    category: "06.E-liquide 50ml",
    productType: "50ml",
    volumeMl: 50,
    promotion10mlEligible: false,
  },
];
const r1 = calculatePromo10ml(mix);
assert(r1.eligibleQuantity === 3, "eligible=3 (ignore 50ml)");
assert(r1.ignoredQuantity === 2, "ignored=2 (50ml)");
assert(r1.freeQuantity === 0, "pas encore de gratuit avec 3");
assert(r1.discountCents === 0, "remise 0 avec 3");

// 6×10ml → 1 offert (le moins cher)
const six: Promo10mlCartLine[] = [
  {
    productId: "c1",
    name: "A 10ml",
    quantity: 2,
    unitPriceCents: 590,
    category: "05.E-liquide 10ml",
    productType: "10ml",
    volumeMl: 10,
    promotion10mlEligible: true,
  },
  {
    productId: "c2",
    name: "B 10ml",
    quantity: 4,
    unitPriceCents: 690,
    category: "05.E-liquide 10ml",
    productType: "10ml",
    volumeMl: 10,
    promotion10mlEligible: true,
  },
];
const r2 = calculatePromo10ml(six);
assert(r2.eligibleQuantity === 6, "6 unités 10ml");
assert(r2.freeQuantity === 1, "1 offert");
assert(r2.discountCents === 590, "offre le moins cher (590)");

// 12×10ml → 2 offerts
const twelve: Promo10mlCartLine[] = [
  {
    productId: "d",
    name: "C 10ml",
    quantity: 12,
    unitPriceCents: 690,
    category: "05.E-liquide 10ml",
    productType: "10ml",
    volumeMl: 10,
    promotion10mlEligible: true,
  },
];
const r3 = calculatePromo10ml(twelve);
assert(r3.freeQuantity === 2, "2 offerts sur 12");
assert(r3.discountCents === 1380, "2×690");

// Produit offert ne peut pas être 50ml (déjà garanti car seuls éligibles entrent)
assert(
  r2.freeUnits.every((u) => u.unitPriceCents === 590 || u.unitPriceCents === 690),
  "unités offertes issues des 10ml uniquement"
);

console.log(`\n${passed} OK / ${failed} FAIL`);
process.exit(failed > 0 ? 1 : 0);
