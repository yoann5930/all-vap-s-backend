/**
 * P0#2 — Agrégation apply-stock (sans DB) + gate existant.
 * npx tsx scripts/test-inventaire-apply-stock-p0.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aggregateLinesForStockApply } from "../lib/inventory/apply-stock";
import {
  INVENTORY_APPLY_STOCK_FROM,
  INVENTORY_STATUSES,
  statusLabel,
} from "../lib/inventory/status";

// --- Gate inchangé ---
assert.ok(INVENTORY_STATUSES.includes("SUBMITTED"));
assert.equal(statusLabel("CORRECTED"), "STOCK APPLIQUÉ");
assert.ok(INVENTORY_APPLY_STOCK_FROM.includes("VALIDATED"));
assert.ok(!INVENTORY_APPLY_STOCK_FROM.includes("OPEN"));

// --- Agrégation : STOCK + VITRINE même produit → somme ---
{
  const { groups, skippedWithoutProduct } = aggregateLinesForStockApply([
    {
      id: "l1",
      productId: "p1",
      variantId: null,
      quantityCounted: 5,
    },
    {
      id: "l2",
      productId: "p1",
      variantId: null,
      quantityCounted: 1,
    },
  ]);
  assert.equal(skippedWithoutProduct, 0);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]!.productId, "p1");
  assert.equal(groups[0]!.totalUnits, 6);
  assert.deepEqual(groups[0]!.lineIds, ["l1", "l2"]);
}

// --- Multi-EAN (2 lignes alias) → somme, pas last-write-wins ---
{
  const { groups } = aggregateLinesForStockApply([
    { id: "a", productId: "resX", variantId: "v1", quantityCounted: 22 },
    { id: "b", productId: "resX", variantId: "v1", quantityCounted: 10 },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]!.totalUnits, 32);
}

// --- Produits distincts restent séparés ---
{
  const { groups } = aggregateLinesForStockApply([
    { id: "1", productId: "p50", variantId: null, quantityCounted: 3 },
    { id: "2", productId: "p100", variantId: null, quantityCounted: 7 },
  ]);
  assert.equal(groups.length, 2);
  const byId = Object.fromEntries(groups.map((g) => [g.productId, g.totalUnits]));
  assert.equal(byId.p50, 3);
  assert.equal(byId.p100, 7);
}

// --- Lignes sans productId skippées ---
{
  const { groups, skippedWithoutProduct } = aggregateLinesForStockApply([
    { id: "x", productId: null, variantId: null, quantityCounted: 9 },
    { id: "y", productId: "p", variantId: null, quantityCounted: 2 },
  ]);
  assert.equal(skippedWithoutProduct, 1);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]!.totalUnits, 2);
}

// --- Source : claim atomique + transaction présents ---
const src = readFileSync("lib/inventory/apply-stock.ts", "utf8");
assert.ok(src.includes("updateMany"));
assert.ok(src.includes("stockAppliedAt: null"));
assert.ok(src.includes("aggregateLinesForStockApply"));
assert.ok(src.includes("isolationLevel"));
assert.ok(src.includes("$transaction"));
// Ne doit plus appeler setStoreStockQuantity en boucle ligne-à-ligne (last-write-wins)
assert.equal(
  /setStoreStockQuantity\(/.test(src),
  false,
  "apply-stock ne doit plus utiliser setStoreStockQuantity ligne par ligne"
);

console.log("OK P0#2 — agrégation apply-stock + claim atomique (source vérifié)");
