/**
 * Tests prix / parsing boîtes résistances inventaire.
 */
import assert from "node:assert/strict";
import {
  computeResistanceBoxPriceCents,
  formatResistanceBoxHint,
  isResistanceProduct,
  parseUnitsPerPackFromName,
  resolveResistanceBoxPriceCents,
} from "../lib/inventory/resistance-box-pricing";

const UNIT = 410; // 4,10 €

assert.equal(parseUnitsPerPackFromName("Pack de 5 résistances Z XM GeekVape 0.15"), 5);
assert.equal(parseUnitsPerPackFromName("GeekVape M Series Quad Coil 0.15ohm 5pk"), 5);
assert.equal(parseUnitsPerPackFromName("Pack de 3 Résistances Ultra Boost Max"), 3);
assert.equal(parseUnitsPerPackFromName("Pack de 4 resistances BDC V2"), 4);
assert.equal(parseUnitsPerPackFromName("PnP X 0.2ohm"), null);
assert.equal(parseUnitsPerPackFromName("boîte de 2 coils mesh"), 2);

assert.equal(computeResistanceBoxPriceCents({ unitPriceCents: UNIT, unitsPerPack: 5 }), 1640);
assert.equal(computeResistanceBoxPriceCents({ unitPriceCents: UNIT, unitsPerPack: 4 }), 1230);
assert.equal(computeResistanceBoxPriceCents({ unitPriceCents: UNIT, unitsPerPack: 3 }), 1230);
assert.equal(computeResistanceBoxPriceCents({ unitPriceCents: UNIT, unitsPerPack: 2 }), 820);
assert.equal(computeResistanceBoxPriceCents({ unitPriceCents: UNIT, unitsPerPack: 1 }), 410);
assert.equal(computeResistanceBoxPriceCents({ unitPriceCents: UNIT, unitsPerPack: 0 }), null);

assert.ok(isResistanceProduct({ name: "GTX-2 0.15 ohm Vaporesso", category: "resistances" }));
assert.ok(isResistanceProduct({ taxonomyGroup: "RESISTANCES" }));
assert.equal(isResistanceProduct({ name: "Ice Cool Ananas", category: "e-liquides" }), false);

assert.equal(
  formatResistanceBoxHint({ boxes: 3, unitsPerPack: 5 }),
  "3 boîtes × 5 = 15 résistances"
);

assert.equal(
  resolveResistanceBoxPriceCents({ catalogPriceCents: 1640, unitsPerPack: 5 }),
  1640
);
assert.equal(
  resolveResistanceBoxPriceCents({ catalogPriceCents: 410, unitsPerPack: 5 }),
  1640
);

console.log("OK resistance-box-pricing");
