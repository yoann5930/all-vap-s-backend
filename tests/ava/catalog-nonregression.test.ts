/**
 * Non-régression catalogue AVA — même moteur searchProductsForAva (site / API / Android métier).
 * Ne pas inventer de produit réel : fixtures uniquement + assertions de source.
 */
import { readFileSync } from "node:fs";
import { searchProductsForAva } from "../../lib/ai/ava/product-search";
import type { AvaCatalogProduct } from "../../lib/ai/ava/types";
import { mergeContextFromMessage as mergeMsg } from "../../lib/ai/ava/conversation-context";

let fail = 0;
function assert(cond: boolean, label: string) {
  if (!cond) {
    fail++;
    console.error("FAIL", label);
  } else console.log("OK", label);
}

function mockProduct(
  partial: Partial<AvaCatalogProduct> & { id: string; name: string },
): AvaCatalogProduct {
  return {
    slug: partial.slug ?? partial.id,
    description: partial.description ?? null,
    shortDescription: null,
    category: partial.category ?? "e-liquides",
    brand: partial.brand ?? "e.Tasty",
    manufacturerName: partial.manufacturerName ?? "e.Tasty",
    range: partial.range ?? "Twenty",
    productType: "e-liquide",
    priceCents: 1290,
    promoPriceCents: null,
    isPromo: false,
    isNew: false,
    stock: partial.stock ?? 8,
    availableQuantity: partial.availableQuantity ?? partial.stock ?? 8,
    stockKnown: true,
    imageUrl: null,
    isActive: true,
    visibleOnline: true,
    catalogStatus: "actif",
    volumeMl: partial.volumeMl ?? 20,
    primaryFlavor: partial.primaryFlavor ?? null,
    secondaryFlavor: null,
    flavorFamily: partial.flavorFamily ?? null,
    flavors: partial.flavors ?? [],
    searchKeywords: partial.searchKeywords ?? null,
    isFresh: partial.isFresh ?? null,
    isFruity: partial.isFruity ?? null,
    isGourmet: false,
    isTobacco: false,
    isMint: partial.isMint ?? null,
    isDrink: null,
    flavorValidated: true,
    avaKeywords: null,
    avaSaveurs: partial.avaSaveurs ?? null,
    avaDescription: null,
    variants: partial.variants ?? [
      {
        id: `${partial.id}-v`,
        name: "20 ml",
        nicotineMg: 3,
        nicotineLabel: "3 mg",
        capacityMl: 20,
        stock: partial.stock ?? 8,
        priceCents: 1290,
        active: true,
        pgVgLabel: "50/50",
      },
    ],
    ...partial,
  };
}

const catalog: AvaCatalogProduct[] = [
  mockProduct({
    id: "twenty-menthe",
    name: "Twenty Menthe Polaire 20ml",
    primaryFlavor: "menthe",
    flavors: ["menthe", "polaire"],
    isMint: true,
    isFresh: true,
    searchKeywords: "twenty menthe polaire e.tasty",
  }),
  mockProduct({
    id: "twenty-peche",
    name: "Twenty Double Pêche 20ml",
    primaryFlavor: "peche",
    flavors: ["peche"],
    isFruity: true,
    isFresh: false,
    searchKeywords: "twenty double peche e.tasty",
  }),
  mockProduct({
    id: "other-brand",
    name: "Call of Vape Alpha 50ml",
    brand: "Cloud Vapor",
    manufacturerName: "Cloud Vapor",
    range: "Call of Vape",
    volumeMl: 50,
    primaryFlavor: "fruit",
    flavors: ["fruit"],
    isFruity: true,
    searchKeywords: "call of vape cloud vapor",
    stock: 0,
    availableQuantity: 0,
    variants: [
      {
        id: "other-v",
        name: "50 ml",
        nicotineMg: 3,
        nicotineLabel: "3 mg",
        capacityMl: 50,
        stock: 0,
        priceCents: 1990,
        active: true,
        pgVgLabel: null,
      },
    ],
  }),
];

const exact = searchProductsForAva(catalog, {
  rawQuery: "Twenty Menthe Polaire",
  flavorTerms: ["menthe", "polaire"],
  freshness: null,
  nicotineMg: null,
  volumeMl: null,
});
assert(exact[0]?.product.id === "twenty-menthe", "recherche exacte Menthe Polaire");

const approx = searchProductsForAva(catalog, {
  rawQuery: "menthe polar",
  flavorTerms: ["menthe"],
  freshness: null,
  nicotineMg: null,
  volumeMl: null,
});
assert(
  approx.some((r) => r.product.id === "twenty-menthe"),
  "recherche approximative menthe",
);

const brand = searchProductsForAva(catalog, {
  rawQuery: "liquide",
  flavorTerms: [],
  freshness: null,
  nicotineMg: null,
  volumeMl: null,
  manufacturer: "e.Tasty",
  category: "e-liquides",
});
assert(
  brand.length > 0 && brand.every((r) => r.product.manufacturerName === "e.Tasty"),
  "filtre marque e.Tasty",
);

const range = searchProductsForAva(catalog, {
  rawQuery: "twenty",
  flavorTerms: [],
  freshness: null,
  nicotineMg: null,
  volumeMl: null,
  range: "Twenty",
  category: "e-liquides",
});
assert(
  range.length > 0 && range.every((r) => r.product.range === "Twenty"),
  "filtre gamme Twenty",
);

const flavor = mergeMsg(null, "Je cherche une menthe.");
const flavored = searchProductsForAva(catalog, flavor);
assert(
  flavored.some((r) => r.product.id === "twenty-menthe"),
  "saveur menthe",
);

const absent = searchProductsForAva(catalog, {
  rawQuery: "xyzzy-produit-inexistant-ava-test",
  flavorTerms: ["xyzzy-produit-inexistant-ava-test"],
  freshness: null,
  nicotineMg: null,
  volumeMl: null,
});
assert(absent.length === 0, "produit absent = aucun résultat (pas d'hallucination)");

const stocked = searchProductsForAva(catalog, {
  rawQuery: "Call of Vape",
  flavorTerms: ["call"],
  freshness: null,
  nicotineMg: null,
  volumeMl: 50,
  manufacturer: "Cloud Vapor",
});
assert(
  stocked.length === 0 || stocked.every((r) => r.outOfStockExact || r.product.availableQuantity === 0),
  "stock associé (rupture Cloud Vapor fixture)",
);
assert(
  catalog.find((p) => p.id === "twenty-menthe")!.availableQuantity > 0,
  "stock positif fixture Twenty",
);

const advisor = readFileSync("lib/ai/ava-advisor.ts", "utf8");
const brain = readFileSync("lib/ava/unified-brain.ts", "utf8");
const service = readFileSync("lib/ai/ava/ava-catalog-service.ts", "utf8");
const api = readFileSync("app/api/ava/route.ts", "utf8");
assert(advisor.includes("searchProductsForAva"), "site chatAva = searchProductsForAva");
assert(brain.includes("getAvaCatalogService"), "cerveau = AvaCatalogService");
assert(service.includes("searchProductsForAva"), "service = searchProductsForAva");
assert(api.includes("runAvaOrchestrator"), "API /api/ava = orchestrateur");

if (fail) process.exit(1);
console.log("OK catalog-nonregression");
