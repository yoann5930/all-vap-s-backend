import {
  normalizeInventoryPlacement,
  validateInventoryPlacementQuantity,
} from "../lib/inventory/placement";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const stockOk = validateInventoryPlacementQuantity({
  placement: "STOCK",
  quantityCounted: 42,
});
assert(stockOk.ok, "stock should allow >1");

const vitrineOk = validateInventoryPlacementQuantity({
  placement: "VITRINE",
  quantityCounted: 1,
});
assert(vitrineOk.ok, "vitrine 1 should be ok");

const vitrineBad = validateInventoryPlacementQuantity({
  placement: "VITRINE",
  quantityCounted: 2,
});
assert(!vitrineBad.ok && "code" in vitrineBad && vitrineBad.code === "VITRINE_QTY_LIMIT", "vitrine >1 refused");

assert(normalizeInventoryPlacement("vitrine") === "VITRINE", "norm vitrine");
assert(normalizeInventoryPlacement(undefined) === "STOCK", "default stock");

console.log(JSON.stringify({ ok: true, tests: 4 }));
