/**
 * P1#1 — Pas de fusion auto nom si volume/nicotine conflictuels.
 * npx tsx scripts/test-inventaire-identity-guards-p1.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  canAutoLinkByName,
  nicotineConflict,
  volumesConflict,
} from "../lib/inventory/product-identity-guards";
import { matchCatalogProduct } from "../lib/catalog/matching";

assert.equal(volumesConflict(50, 100), true);
assert.equal(volumesConflict(50, 50), false);
assert.equal(volumesConflict(50, null), false);
assert.equal(volumesConflict(null, 100), false);

assert.equal(nicotineConflict(6, [3, 6, 12]), false);
assert.equal(nicotineConflict(6, [3, 12]), true);
assert.equal(nicotineConflict(6, []), false);
assert.equal(nicotineConflict(null, [3]), false);

assert.equal(
  canAutoLinkByName({
    sourceName: "Fruit Mix 50ml 6mg",
    candidate: { name: "Fruit Mix 100ml 6mg", volumeMl: 100, nicotineMgs: [6] },
  }),
  false,
  "50≠100 doit bloquer"
);

assert.equal(
  canAutoLinkByName({
    sourceName: "Fruit Mix 50ml 6mg",
    candidate: { name: "Fruit Mix 50ml 12mg", volumeMl: 50, nicotineMgs: [12] },
  }),
  false,
  "nicotine mismatch doit bloquer"
);

assert.equal(
  canAutoLinkByName({
    sourceName: "Fruit Mix 50ml 6mg",
    candidate: { name: "Fruit Mix 50ml 6mg", volumeMl: 50, nicotineMgs: [6] },
  }),
  true,
  "même 50ml + 6mg autorisé"
);

assert.equal(
  canAutoLinkByName({
    sourceName: "Fruit Mix 50ml",
    sourceVolumeMl: 50,
    candidate: { name: "Fruit Mix 100ml", volumeMl: 100 },
  }),
  false
);

const catalog = [
  {
    id: "p100",
    name: "Fruit Mix 100ml 6mg",
    normalizedName: "fruit mix 100ml 6mg",
    sku: null,
    barcode: null,
    sumupProductId: null,
    brand: "X",
    volumeMl: 100,
    nicotineMgs: [6],
  },
  {
    id: "p50",
    name: "Fruit Mix 50ml 6mg",
    normalizedName: "fruit mix 50ml 6mg",
    sku: null,
    barcode: null,
    sumupProductId: null,
    brand: "X",
    volumeMl: 50,
    nicotineMgs: [6],
  },
];

const blocked = matchCatalogProduct(
  {
    name: "Fruit Mix 50ml 6mg",
    normalizedName: "fruit mix 50ml 6mg",
    volumeMlHint: 50,
    nicotineMgHint: 6,
  },
  [catalog[0]]
);
assert.equal(
  blocked.decision === "AUTO" && blocked.productId === "p100",
  false,
  "matching ne doit pas AUTO-lier 50→100"
);

const ok = matchCatalogProduct(
  {
    name: "Fruit Mix 50ml 6mg",
    normalizedName: "fruit mix 50ml 6mg",
    volumeMlHint: 50,
    nicotineMgHint: 6,
  },
  catalog
);
assert.equal(ok.productId, "p50");
assert.equal(ok.decision, "AUTO");

const matchingSrc = readFileSync("lib/catalog/matching.ts", "utf8");
assert.ok(matchingSrc.includes("canAutoLinkByName"));
assert.ok(matchingSrc.includes("nameLinkAllowed"));

const lookupSrc = readFileSync("app/api/inventaire/lookup/route.ts", "utf8");
assert.ok(lookupSrc.includes("canAutoLinkByName"));
assert.ok(lookupSrc.includes("bestCompatible"));

const guardsSrc = readFileSync("lib/inventory/product-identity-guards.ts", "utf8");
assert.ok(guardsSrc.includes("volumesConflict"));
assert.ok(guardsSrc.includes("nicotineConflict"));

console.log("OK P1#1 — garde identité volume/nicotine (50≠100, nicotine)");
