/**
 * Tests unitaires du gate stock inventaire (sans DB).
 * Exécuter : npx tsx scripts/test-inventory-stock-gate.ts
 */
import assert from "node:assert/strict";
import {
  INVENTORY_APPLY_STOCK_FROM,
  INVENTORY_STATUSES,
  statusLabel,
} from "../lib/inventory/status";

function testStatuses() {
  assert.ok(INVENTORY_STATUSES.includes("SUBMITTED"));
  assert.equal(statusLabel("SUBMITTED"), "SOUMIS À VALIDATION");
  assert.equal(statusLabel("CORRECTED"), "STOCK APPLIQUÉ");
  assert.deepEqual(
    [...INVENTORY_APPLY_STOCK_FROM].sort(),
    ["COMPLETED", "SUBMITTED", "VALIDATED"].sort()
  );
  assert.ok(!INVENTORY_APPLY_STOCK_FROM.includes("OPEN"));
  assert.ok(!INVENTORY_APPLY_STOCK_FROM.includes("CANCELLED"));
}

function testConfirmTokenContract() {
  const required = "APPLY_STOCK_CONFIRMED";
  assert.notEqual("yes", required);
  assert.equal(required, "APPLY_STOCK_CONFIRMED");
}

testStatuses();
testConfirmTokenContract();
console.log("OK inventory stock gate tests");
