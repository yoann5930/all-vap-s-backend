/**
 * Tests recherche catalogue A.V.A. (sans DB si possible — unitaires parsers + ranking mock).
 * npx tsx scripts/test-ava-catalog-search.ts
 */
import {
  parseFlavorFamily,
  parseFreshness,
  parseNicotineMg,
  parseVolumeMl,
  parseCategory,
  parseProductReference,
  mergeContextFromMessage,
} from "../lib/ai/ava/conversation-context";
import { searchProductsForAva } from "../lib/ai/ava/product-search";
import { emptyConversationContext, type AvaCatalogProduct } from "../lib/ai/ava/types";

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

function mockProduct(partial: Partial<AvaCatalogProduct> & { id: string; name: string }): AvaCatalogProduct {
  return {
    slug: partial.slug ?? partial.id,
    description: partial.description ?? null,
    shortDescription: null,
    category: partial.category ?? "e-liquides",
    brand: partial.brand ?? "TestBrand",
    manufacturerName: partial.manufacturerName ?? "TestBrand",
    range: partial.range ?? null,
    productType: "e-liquide",
    priceCents: partial.priceCents ?? 1990,
    promoPriceCents: null,
    isPromo: false,
    isNew: false,
    stock: partial.stock ?? 10,
    availableQuantity: partial.availableQuantity ?? partial.stock ?? 10,
    stockKnown: true,
    imageUrl: null,
    isActive: true,
    visibleOnline: true,
    catalogStatus: "actif",
    volumeMl: partial.volumeMl ?? 50,
    primaryFlavor: partial.primaryFlavor ?? null,
    secondaryFlavor: null,
    flavorFamily: partial.flavorFamily ?? null,
    flavors: partial.flavors ?? [],
    searchKeywords: partial.searchKeywords ?? null,
    isFresh: partial.isFresh ?? null,
    isFruity: partial.isFruity ?? null,
    isGourmet: partial.isGourmet ?? null,
    isTobacco: partial.isTobacco ?? null,
    isMint: partial.isMint ?? null,
    isDrink: null,
    flavorValidated: true,
    avaKeywords: null,
    avaSaveurs: partial.avaSaveurs ?? null,
    avaDescription: null,
    variants: partial.variants ?? [
      {
        id: `${partial.id}-v6`,
        name: "6 mg",
        nicotineMg: 6,
        nicotineLabel: "6 mg",
        capacityMl: 50,
        stock: 5,
        priceCents: 1990,
        active: true,
        pgVgLabel: "50/50",
      },
    ],
    ...partial,
  };
}

async function main() {
  console.log("=== A.V.A. catalog search tests ===\n");

  assert(parseNicotineMg("en 6 mg") === 6, "parse nicotine 6 mg");
  assert(parseVolumeMl("50 ml") === 50, "parse volume 50 ml");
  assert(parseFreshness("sans fraîcheur") === "without", "sans fraîcheur");
  assert(parseFreshness("avec fraîcheur") === "with", "avec fraîcheur");
  assert(parseFlavorFamily("fruits rouges").family === "fruits_rouges", "fruits rouges");
  assert(parseFlavorFamily("fraise").family === "fruits_rouges", "fraise → fruits rouges");
  assert(parseCategory("je cherche un liquide") === "e-liquides", "catégorie liquide");
  assert(parseProductReference("montre-moi le deuxième", ["A", "B", "C"]) === 1, "réf. 2e");

  const products = [
    mockProduct({
      id: "1",
      name: "Fruits Rouges 50ml",
      primaryFlavor: "fraise",
      flavors: ["fraise", "framboise"],
      isFruity: true,
      isFresh: false,
      searchKeywords: "fruits rouges fraise framboise",
    }),
    mockProduct({
      id: "2",
      name: "Ice Berry Freeze",
      primaryFlavor: "myrtille",
      isFruity: true,
      isFresh: true,
      searchKeywords: "fruits rouges ice freeze",
      flavors: ["myrtille"],
    }),
    mockProduct({
      id: "3",
      name: "Vanille Custard",
      isGourmet: true,
      isFresh: false,
      primaryFlavor: "vanille",
      searchKeywords: "gourmand vanille",
      availableQuantity: 0,
      stock: 0,
      variants: [
        {
          id: "3-v",
          name: "6 mg",
          nicotineMg: 6,
          nicotineLabel: "6 mg",
          capacityMl: 50,
          stock: 0,
          priceCents: 1990,
          active: true,
          pgVgLabel: null,
        },
      ],
    }),
  ];

  {
    const criteria = mergeContextFromMessage(
      null,
      "Je cherche un fruits rouges sans fraîcheur en 6 mg."
    );
    assert(criteria.flavorFamily === "fruits_rouges", "critère fruits rouges");
    assert(criteria.freshness === "without", "critère sans frais");
    assert(criteria.nicotineMg === 6, "critère 6 mg");
    const ranked = searchProductsForAva(products, criteria);
    assert(ranked.length >= 1, "au moins 1 résultat");
    assert(ranked[0]?.product.id === "1", "priorité non-frais fruits rouges");
    assert(!ranked.some((r) => r.product.id === "3"), "exclure rupture gourmand");
  }

  {
    const ctx = emptyConversationContext();
    ctx.lastProposedNames = ["Alpha", "Beta", "Gamma"];
    ctx.lastProposedProductIds = ["1", "2", "3"];
    const m = mergeContextFromMessage(ctx, "Fruité.");
    assert(m.context.turn === 1, "contexte tour incrémenté");
  }

  {
    const criteria = mergeContextFromMessage(null, "Je cherche un liquide.");
    assert(
      criteria.needsClarification === "flavor",
      "question précision saveur sur demande vague"
    );
  }

  {
    const criteria = mergeContextFromMessage(null, "Je cherche une résistance.");
    assert(criteria.needsClarification === "device", "demande modèle appareil");
  }

  console.log(`\nRésultat : ${passed} OK, ${failed} FAIL`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
