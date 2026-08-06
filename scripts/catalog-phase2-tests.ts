/**
 * Tests Phase 2 — double stock HAUTMONT / LE_QUESNOY, global = somme.
 * Run: npx tsx scripts/catalog-phase2-tests.ts
 */
import {
  normalizeProductName,
  extractExplicitSpecs,
  GLOBAL_STOCK_CODE,
  HAUTMONT_STOCK_CODE,
  LE_QUESNOY_STOCK_CODE,
  STOCK_LOCATION_SEED,
  STORE_STOCK_CODES,
  isStoreStockCode,
  storeIdToStockCode,
} from "../lib/catalog/normalize";
import { matchCatalogProduct } from "../lib/catalog/matching";
import { buildSumUpImportPreview } from "../lib/catalog/sumup-csv-import";
import {
  avaAvailabilityPhrase,
  computeAvailable,
  stockStatusFromLevel,
  type GlobalStockSnapshot,
} from "../lib/catalog/stock";

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

assert(STORE_STOCK_CODES.includes(HAUTMONT_STOCK_CODE), "code HAUTMONT");
assert(STORE_STOCK_CODES.includes(LE_QUESNOY_STOCK_CODE), "code LE_QUESNOY");
assert(STOCK_LOCATION_SEED.length === 2, "deux emplacements seed");
const seedCodes = STOCK_LOCATION_SEED.map((l) => l.code as string);
assert(seedCodes.includes("HAUTMONT"), "seed HAUTMONT");
assert(seedCodes.includes("LE_QUESNOY"), "seed LE_QUESNOY");
assert(!seedCodes.includes(GLOBAL_STOCK_CODE), "GLOBAL hors seed writable");
assert(isStoreStockCode("HAUTMONT"), "isStoreStockCode HAUTMONT");
assert(!isStoreStockCode("GLOBAL_ALL_VAPS"), "GLOBAL non writable");
assert(storeIdToStockCode("hautmont") === "HAUTMONT", "map hautmont");
assert(storeIdToStockCode("le-quesnoy") === "LE_QUESNOY", "map le-quesnoy");
assert(storeIdToStockCode(null) === "HAUTMONT", "défaut Hautmont");

assert(computeAvailable(10, 3) === 7, "available = qty - reserved");
assert(computeAvailable(2, 5) === 0, "pas de disponible négatif");

assert(
  stockStatusFromLevel({ known: true, availableQuantity: 10, lowStockThreshold: 3 }) === "EN_STOCK",
  "EN_STOCK"
);
assert(
  stockStatusFromLevel({ known: true, availableQuantity: 2, lowStockThreshold: 3 }) ===
    "STOCK_FAIBLE",
  "STOCK_FAIBLE"
);
assert(
  stockStatusFromLevel({ known: true, availableQuantity: 0, lowStockThreshold: 3 }) === "RUPTURE",
  "RUPTURE"
);
assert(
  stockStatusFromLevel({ known: false, availableQuantity: 0, lowStockThreshold: 3 }) === "INCONNU",
  "INCONNU"
);

assert(
  normalizeProductName("Fraise glacée 50ML") === normalizeProductName("fraise glacee 50 ml"),
  "normalise fraise glacée"
);
assert(extractExplicitSpecs("Pod simple").nicotineMg === null, "pas d'invention nicotine");

const catalog = [
  {
    id: "p1",
    name: "E-liquide Frais Rouge 10ml",
    normalizedName: normalizeProductName("E-liquide Frais Rouge 10ml"),
    sku: "FR-10",
    barcode: "111",
    sumupProductId: "SU1",
    brand: "All Vaps",
  },
];

assert(matchCatalogProduct({ name: "x", normalizedName: "x", barcode: "111" }, catalog).method === "barcode", "barcode");
assert(matchCatalogProduct({ name: "x", normalizedName: "x", sku: "FR-10" }, catalog).method === "sku", "sku");
assert(
  matchCatalogProduct(
    {
      name: "E liquide Frais Rouge 10 ml",
      normalizedName: normalizeProductName("E liquide Frais Rouge 10 ml"),
    },
    catalog
  ).decision === "AUTO",
  "nom normalisé"
);
assert(
  matchCatalogProduct(
    { name: "Truc inconnu", normalizedName: normalizeProductName("Truc inconnu") },
    catalog
  ).decision === "UNMATCHED",
  "non reconnu isolé"
);

const previewH = buildSumUpImportPreview({
  csvContent: `name,barcode,sku,quantity
E-liquide Frais Rouge 10ml,111,FR-10,8
Produit Inconnu Test,,UNK-1,2
Doublon Alpha,,DUP,1
Doublon Alpha,,DUP,2
`,
  catalog,
  currentQuantities: new Map([["p1", 5]]),
  locationCode: "HAUTMONT",
});

assert(previewH.locationCode === "HAUTMONT", "import vers Hautmont");
assert(previewH.updateCount >= 1, "maj stock boutique");
assert(previewH.unmatchedCount >= 1, "non reconnus");
assert(previewH.duplicateCount >= 1, "doublons");
assert(
  previewH.rows.some(
    (r) => r.action === "UPDATE_STOCK" && r.quantityBefore === 5 && r.quantityAfter === 8
  ),
  "avant/après"
);

const previewQ = buildSumUpImportPreview({
  csvContent: `name,barcode,sku,quantity
E-liquide Frais Rouge 10ml,111,FR-10,3
`,
  catalog,
  currentQuantities: new Map([["p1", 1]]),
  locationCode: "LE_QUESNOY",
});
assert(previewQ.locationCode === "LE_QUESNOY", "import vers Le Quesnoy");

const available: GlobalStockSnapshot = {
  productId: "p1",
  variantId: "v1",
  quantity: 5,
  reservedQuantity: 0,
  availableQuantity: 5,
  lowStockThreshold: 3,
  source: "dual_sum",
  lastSyncedAt: new Date(),
  known: true,
  status: "EN_STOCK",
};
assert(avaAvailabilityPhrase(available).includes("disponible chez All Vap"), "Ava dispo générale");
assert(!/Hautmont|Quesnoy/i.test(avaAvailabilityPhrase(available)), "Ava sans boutique");

const rupture: GlobalStockSnapshot = { ...available, availableQuantity: 0, status: "RUPTURE" };
assert(avaAvailabilityPhrase(rupture).includes("rupture"), "Ava rupture");

const unknown: GlobalStockSnapshot = { ...available, known: false, status: "INCONNU" };
assert(avaAvailabilityPhrase(unknown).includes("confirmer"), "Ava stock inconnu");

const requiredSheets = ["Stocks_Hautmont", "Stocks_Le_Quesnoy", "Stocks_Global_Calcule"];
assert(requiredSheets.includes("Stocks_Hautmont"), "feuille Stocks_Hautmont");
assert(requiredSheets.includes("Stocks_Le_Quesnoy"), "feuille Stocks_Le_Quesnoy");
assert(requiredSheets.includes("Stocks_Global_Calcule"), "feuille Stocks_Global_Calcule");

console.log(`\nRésultat: ${passed} OK, ${failed} FAIL`);
process.exit(failed > 0 ? 1 : 0);
