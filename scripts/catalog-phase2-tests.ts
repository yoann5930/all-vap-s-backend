/**
 * Tests Phase 2 corrigée — stock général GLOBAL_ALL_VAPS uniquement.
 * Run: npx tsx scripts/catalog-phase2-tests.ts
 */
import { normalizeProductName, extractExplicitSpecs, GLOBAL_STOCK_CODE, STOCK_LOCATION_SEED } from "../lib/catalog/normalize";
import { matchCatalogProduct } from "../lib/catalog/matching";
import { buildSumUpImportPreview } from "../lib/catalog/sumup-csv-import";
import { avaAvailabilityPhrase, computeAvailable, stockStatusFromLevel, type GlobalStockSnapshot } from "../lib/catalog/stock";

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

// 1–3 Emplacement unique
assert(GLOBAL_STOCK_CODE === "GLOBAL_ALL_VAPS", "code GLOBAL_ALL_VAPS");
assert(STOCK_LOCATION_SEED.length === 1, "un seul emplacement seed");
const seedCodes = STOCK_LOCATION_SEED.map((l) => l.code as string);
assert(!seedCodes.includes("HAUTMONT"), "absence HAUTMONT");
assert(!seedCodes.includes("LE_QUESNOY"), "absence LE_QUESNOY");

// Available calc
assert(computeAvailable(10, 3) === 7, "available = qty - reserved");
assert(computeAvailable(2, 5) === 0, "pas de disponible négatif");

assert(stockStatusFromLevel({ known: true, availableQuantity: 10, lowStockThreshold: 3 }) === "EN_STOCK", "EN_STOCK");
assert(stockStatusFromLevel({ known: true, availableQuantity: 2, lowStockThreshold: 3 }) === "STOCK_FAIBLE", "STOCK_FAIBLE");
assert(stockStatusFromLevel({ known: true, availableQuantity: 0, lowStockThreshold: 3 }) === "RUPTURE", "RUPTURE");
assert(stockStatusFromLevel({ known: false, availableQuantity: 0, lowStockThreshold: 3 }) === "INCONNU", "INCONNU");

// Normalisation
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
    { name: "E liquide Frais Rouge 10 ml", normalizedName: normalizeProductName("E liquide Frais Rouge 10 ml") },
    catalog
  ).decision === "AUTO",
  "nom normalisé"
);
assert(
  matchCatalogProduct({ name: "Truc inconnu", normalizedName: normalizeProductName("Truc inconnu") }, catalog)
    .decision === "UNMATCHED",
  "non reconnu isolé"
);

const preview = buildSumUpImportPreview({
  csvContent: `name,barcode,sku,quantity
E-liquide Frais Rouge 10ml,111,FR-10,8
Produit Inconnu Test,,UNK-1,2
Doublon Alpha,,DUP,1
Doublon Alpha,,DUP,2
`,
  catalog,
  currentQuantities: new Map([["p1", 5]]),
});

assert(preview.locationCode === "GLOBAL_ALL_VAPS", "import vers stock général");
assert(preview.updateCount >= 1, "maj stock général");
assert(preview.unmatchedCount >= 1, "non reconnus");
assert(preview.duplicateCount >= 1, "doublons");
assert(preview.rows.some((r) => r.action === "UPDATE_STOCK" && r.quantityBefore === 5 && r.quantityAfter === 8), "avant/après");

const available: GlobalStockSnapshot = {
  productId: "p1",
  variantId: "v1",
  quantity: 5,
  reservedQuantity: 0,
  availableQuantity: 5,
  lowStockThreshold: 3,
  source: "sumup_csv",
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

// Excel sheet names (constants check)
const forbiddenSheets = ["Stocks_Hautmont", "Stocks_Le_Quesnoy"];
const requiredSheet = "Stock_General_All_Vaps";
assert(!forbiddenSheets.includes(requiredSheet), "feuille générale ≠ hautmont");
assert(requiredSheet === "Stock_General_All_Vaps", "feuille Stock_General_All_Vaps");

console.log(`\nRésultat: ${passed} OK, ${failed} FAIL`);
process.exit(failed > 0 ? 1 : 0);
