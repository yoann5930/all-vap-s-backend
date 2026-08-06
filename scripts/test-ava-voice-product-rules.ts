/**
 * Règles vocales AVA (e.Tasty, pas de prix/stock/fiche catalogue).
 * npx tsx scripts/test-ava-voice-product-rules.ts
 */
import {
  commercialProductName,
  pronounceEtasty,
  stripCatalogFactsFromSpeech,
} from "../lib/ai/ava-voice-product-rules";
import { humanizeForSpeech, toSpokenText } from "../lib/ai/ava-speech-utils";
import { buildAvaProductAnswer, buildOutOfStockAnswer } from "../lib/ai/ava/response-builder";
import type { AvaCatalogProduct, AvaRankedProduct, AvaSearchCriteria } from "../lib/ai/ava/types";

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string) {
  if (cond) {
    passed++;
    console.log(`  OK  ${label}`);
  } else {
    failed++;
    console.error(`  FAIL ${label}`);
  }
}

function forbidCatalogSpeech(text: string, label: string) {
  const hasPrice = /\d+(?:[.,]\d+)?\s*€|\b\d+(?:[.,]\d+)?\s*euros?\b/i.test(text);
  const hasStock = /\d+\s*(?:en stock|restant)/i.test(text);
  const hasVolume = /\b\d+\s*ml\b/i.test(text);
  const hasBadEtasty = /\be\s*point\s*tasty\b|\be[\s-]tasty\b|\be\s*[.·]\s*tasty\b/i.test(text);
  assert(!hasPrice && !hasStock && !hasVolume && !hasBadEtasty, label);
}

function mockProduct(name: string, id: string): AvaCatalogProduct {
  return {
    id,
    slug: id,
    name,
    description: null,
    shortDescription: null,
    category: "e-liquides",
    brand: "e.Tasty",
    manufacturerName: "e.Tasty",
    range: "Bankiz",
    productType: "e-liquide",
    priceCents: 2090,
    promoPriceCents: null,
    isPromo: false,
    isNew: false,
    stock: 2,
    availableQuantity: 2,
    stockKnown: true,
    imageUrl: null,
    isActive: true,
    visibleOnline: true,
    catalogStatus: "actif",
    volumeMl: 50,
    primaryFlavor: null,
    secondaryFlavor: null,
    flavorFamily: null,
    flavors: [],
    searchKeywords: null,
    isFresh: null,
    isFruity: null,
    isGourmet: null,
    isTobacco: null,
    isMint: null,
    isDrink: null,
    flavorValidated: true,
    avaKeywords: null,
    avaSaveurs: null,
    avaDescription: null,
    variants: [
      {
        id: `${id}-v`,
        name: "0 mg",
        nicotineMg: 0,
        nicotineLabel: "0 mg",
        capacityMl: 50,
        priceCents: 2090,
        stock: 2,
        active: true,
        pgVgLabel: null,
      },
    ],
  };
}

console.log("\n=== AVA voice product rules ===\n");

assert(
  commercialProductName("Bako 50 ml Bankiz e.Tasty") === "Bako",
  'commercialProductName("Bako 50 ml Bankiz e.Tasty") → Bako'
);
assert(
  commercialProductName("Letters A 100 ml") === "Letters A",
  'commercialProductName("Letters A 100 ml") → Letters A'
);
assert(
  commercialProductName("Numbers 7") === "Numbers 7",
  'commercialProductName("Numbers 7") → Numbers 7'
);
assert(
  pronounceEtasty("Découvrez e.Tasty Bankiz") === "Découvrez i tésti Bankiz",
  'pronounceEtasty("e.Tasty") → i tésti'
);
assert(
  pronounceEtasty("E-Tasty Freezy") === "i tésti Freezy",
  'pronounceEtasty("E-Tasty") → i tésti'
);

const stripped = stripCatalogFactsFromSpeech(
  "Bako 50 ml Bankiz e.Tasty 20,90 €, 2 en stock"
);
assert(!/\d+\s*€|en stock|\d+\s*ml/i.test(stripped), "stripCatalogFacts retire prix/stock/ml");

const spokenEtasty = humanizeForSpeech("Essayez e.Tasty Freho 50 ml à 20,90 € — 2 en stock");
assert(/\bi\s+tésti\b/i.test(spokenEtasty), "humanizeForSpeech prononce i tésti");
forbidCatalogSpeech(spokenEtasty, "humanizeForSpeech sans prix/stock/ml/e point");

const criteria: AvaSearchCriteria = {
  rawQuery: "liquide bako",
  flavorFamily: null,
  flavorTerms: [],
  freshness: null,
  nicotineMg: null,
  volumeMl: null,
  category: "e-liquides",
  promoOnly: false,
  newOnly: false,
};

const multi: AvaRankedProduct[] = [
  {
    product: mockProduct("Bako 50 ml Bankiz e.Tasty", "p1"),
    score: 90,
    matchedVariant: mockProduct("Bako 50 ml Bankiz e.Tasty", "p1").variants[0],
    reason: "match",
    needsVerification: false,
    outOfStockExact: false,
  },
  {
    product: mockProduct("Freho 50 ml Bankiz e.Tasty", "p2"),
    score: 85,
    matchedVariant: mockProduct("Freho 50 ml Bankiz e.Tasty", "p2").variants[0],
    reason: "match",
    needsVerification: false,
    outOfStockExact: false,
  },
];

const multiAns = buildAvaProductAnswer(multi, criteria);
assert(/plusieurs/i.test(multiAns.content), "multi : annonce plusieurs références");
assert(/Bako/i.test(multiAns.content) && /Freho/i.test(multiAns.content), "multi : cite Bako et Freho");
assert(!/Bankiz|e\.Tasty|20,?90|€|en stock|50\s*ml/i.test(multiAns.content), "multi : pas fiche catalogue");
assert(/écran|dessous|affich/i.test(multiAns.content), "multi : renvoi écran");
forbidCatalogSpeech(toSpokenText(multiAns.content, 420), "multi spoken propre");

const singleAns = buildAvaProductAnswer([multi[0]], criteria);
assert(/trouvé|affiche/i.test(singleAns.content), "single : fiche sous l'écran");
assert(!/20,?90|€|en stock|Bankiz|50\s*ml/i.test(singleAns.content), "single : pas lecture fiche");

const oos = buildOutOfStockAnswer("Bako 50 ml Bankiz e.Tasty");
assert(/Bako/i.test(oos) && !/50\s*ml|Bankiz|€/i.test(oos), "rupture : nom court seulement");

console.log(`\nRésultat : ${passed} OK, ${failed} FAIL\n`);
process.exit(failed > 0 ? 1 : 0);
