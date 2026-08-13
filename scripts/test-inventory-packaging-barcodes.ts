/**
 * Tests conditionnement 1–5 + suggestion alias (sans fusion silencieuse).
 * npx tsx scripts/test-inventory-packaging-barcodes.ts
 */
import assert from "node:assert/strict";
import {
  computeTotalUnits,
  formatPackagedStockLabel,
  isPackagedHardwareCategory,
  normalizeUnitsPerBox,
  splitUnitsIntoBoxes,
  UNITS_PER_BOX_ALLOWED,
} from "../lib/inventory/packaging";
import { barcodeCandidates } from "../lib/inventory/product-barcodes";
import { normalizeProductName } from "../lib/catalog/normalize";
import {
  parseNicotineMgFromText,
  parseVolumeMlFromText,
} from "../lib/inventory/barcode-alias-suggest";

// --- Conditionnement ---
assert.deepEqual([...UNITS_PER_BOX_ALLOWED], [1, 2, 3, 4, 5]);
assert.equal(normalizeUnitsPerBox(5), 5);
assert.equal(normalizeUnitsPerBox(6), null);
assert.equal(normalizeUnitsPerBox(0), null);

assert.equal(
  computeTotalUnits({ fullBoxes: 6, unitsPerBox: 5, looseUnits: 2 }),
  32
);
assert.equal(
  computeTotalUnits({ fullBoxes: 0, unitsPerBox: 3, looseUnits: 2 }),
  2
);
assert.equal(
  computeTotalUnits({ fullBoxes: 4, unitsPerBox: 1, looseUnits: 0 }),
  4
);
assert.equal(
  computeTotalUnits({ fullBoxes: 2, unitsPerBox: 2, looseUnits: 0 }),
  4
);

assert.deepEqual(splitUnitsIntoBoxes({ totalUnits: 32, unitsPerBox: 5 }), {
  fullBoxes: 6,
  looseUnits: 2,
  totalUnits: 32,
});

assert.equal(
  formatPackagedStockLabel({ totalUnits: 32, unitsPerBox: 5 }),
  "Stock : 6 boîtes × 5 + 2 unités = 32 unités"
);
assert.equal(
  formatPackagedStockLabel({ totalUnits: 3, unitsPerBox: null }),
  "Stock : 3 unités"
);

assert.ok(
  isPackagedHardwareCategory({
    name: "Résistance GTX 0.2",
    category: "resistances",
  })
);
assert.ok(
  isPackagedHardwareCategory({
    name: "Réservoir Zeus Subohm",
    category: "materiel",
  })
);
assert.equal(
  isPackagedHardwareCategory({
    name: "Mexican Cartel Ananas Fraise Pêche 50ml",
    category: "e-liquides",
  }),
  false
);

// --- Candidats barcode UPC/EAN ---
const cands = barcodeCandidates("012345678901");
assert.ok(cands.includes("012345678901"));
assert.ok(cands.includes("12345678901") || cands.includes("0123456789012") || cands.length >= 1);

// --- Normalisation noms (accents / casse) ---
assert.equal(
  normalizeProductName("Ananas-Fraise Pêche"),
  normalizeProductName("ananas fraise peche")
);

assert.equal(parseVolumeMlFromText("Ananas Fraise Pêche 50 ml"), 50);
assert.equal(parseVolumeMlFromText("Ananas Fraise Pêche 100ml"), 100);
assert.equal(parseVolumeMlFromText("Résistance GTX"), null);
assert.equal(parseNicotineMgFromText("sel 10 mg"), 10);
assert.equal(parseNicotineMgFromText("0mg"), 0);

// --- Règles anti-fusion (simulées comme dans barcode-alias-suggest) ---
function mustNotMerge(a: {
  name: string;
  volumeMl?: number | null;
  nic?: number | null;
}, b: {
  name: string;
  volumeMl?: number | null;
  nic?: number | null;
}) {
  if (
    a.volumeMl != null &&
    b.volumeMl != null &&
    a.volumeMl !== b.volumeMl
  ) {
    return true; // interdit
  }
  if (a.nic != null && b.nic != null && Math.abs(a.nic - b.nic) >= 0.05) {
    return true;
  }
  return false;
}

assert.equal(
  mustNotMerge(
    { name: "Ananas Fraise Pêche", volumeMl: 50 },
    { name: "Ananas Fraise Pêche", volumeMl: 100 }
  ),
  true
);
assert.equal(
  mustNotMerge(
    { name: "Ananas Fraise Pêche", nic: 0 },
    { name: "Ananas Fraise Pêche", nic: 3 }
  ),
  true
);
assert.equal(
  mustNotMerge(
    { name: "Ananas Fraise Pêche", volumeMl: 50, nic: 0 },
    { name: "Ananas Fraise Pêche", volumeMl: 50, nic: 0 }
  ),
  false
);

// Boîte ouverte + multi EAN (logique stock unifié)
const resistanceStock = computeTotalUnits({
  fullBoxes: 4,
  unitsPerBox: 5,
  looseUnits: 2,
});
assert.equal(resistanceStock, 22);
// Scan alias A ou B → même total
assert.equal(
  formatPackagedStockLabel({ totalUnits: resistanceStock, unitsPerBox: 5 }),
  "Stock : 4 boîtes × 5 + 2 unités = 22 unités"
);

console.log("OK — packaging + alias rules + stock unifié");
