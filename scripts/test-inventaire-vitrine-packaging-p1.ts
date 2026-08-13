/**
 * P1#2 — Vitrine : limite sur unités (pas boîtes UI).
 * npx tsx scripts/test-inventaire-vitrine-packaging-p1.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeTotalUnits } from "../lib/inventory/packaging";
import { validateInventoryPlacementQuantity } from "../lib/inventory/placement";

// 1 boîte × 5 = 5 unités → refus vitrine (serveur)
const fiveUnits = computeTotalUnits({
  fullBoxes: 1,
  unitsPerBox: 5,
  looseUnits: 0,
});
assert.equal(fiveUnits, 5);
const bad = validateInventoryPlacementQuantity({
  placement: "VITRINE",
  quantityCounted: fiveUnits,
});
assert.equal(bad.ok, false);
assert.ok(!bad.ok && bad.code === "VITRINE_QTY_LIMIT");

// 0 boîte + 1 loose = 1 unité → OK vitrine
const oneUnit = computeTotalUnits({
  fullBoxes: 0,
  unitsPerBox: 5,
  looseUnits: 1,
});
assert.equal(oneUnit, 1);
const ok = validateInventoryPlacementQuantity({
  placement: "VITRINE",
  quantityCounted: oneUnit,
});
assert.equal(ok.ok, true);

// 1 boîte × 1 = 1 unité → OK
const onePerBox = computeTotalUnits({
  fullBoxes: 1,
  unitsPerBox: 1,
  looseUnits: 0,
});
assert.equal(onePerBox, 1);
assert.equal(
  validateInventoryPlacementQuantity({
    placement: "VITRINE",
    quantityCounted: onePerBox,
  }).ok,
  true
);

const ui = readFileSync("components/inventory/EmployeeInventoryApp.tsx", "utf8");
assert.ok(
  !ui.includes("quantityCounted: packaged ? boxes : qty"),
  "UI ne doit plus valider la vitrine sur le nb de boîtes"
);
assert.ok(
  ui.includes("quantityCounted: qty"),
  "UI doit valider la vitrine sur le total unités"
);
assert.ok(
  ui.includes('setQuantity("0")') && ui.includes('setLooseUnits("1")'),
  "passage Vitrine conditionné → 0 boîte + 1 unité"
);

const lines = readFileSync(
  "app/api/inventaire/sessions/[id]/lines/route.ts",
  "utf8"
);
assert.ok(
  /validateInventoryPlacementQuantity\(\{\s*placement,\s*quantityCounted,/.test(
    lines
  ) || lines.includes("quantityCounted,"),
  "POST lines valide quantityCounted (unités)"
);

console.log("OK P1#2 — Vitrine alignée unités (pas boîtes)");
