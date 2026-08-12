/**
 * Test unitaire inférence packshot (sans DB) — règle certain ≥ 0.7.
 */
import assert from "node:assert/strict";
import { inferProductPackshotUrl } from "../lib/catalog/infer-product-packshot-url";

function ok(name: string, expectedFlavor: string) {
  const url = inferProductPackshotUrl({
    imageUrl: null,
    productName: name,
    manufacturerSlug: "liquidarom",
    manufacturerName: "Liquidarom",
    rangeSlug: "ice-cool",
    rangeName: "Ice Cool",
  });
  assert.ok(url, `expected url for ${name}`);
  assert.ok(url!.includes(expectedFlavor), `${url} should include ${expectedFlavor}`);
}

ok("Liquidarom — Ice Cool — Ananas Kiwi Jaune 50 ml", "ananas-kiwi-jaune");
ok("Liquidarom — Ice Cool — Cassis Citron 50 ml", "cassis-citron");
ok("Liquidarom — Ice Cool — Framboise Bleue Pitaya 50 ml", "framboise-bleue-pitaya");

const x = inferProductPackshotUrl({
  imageUrl: null,
  productName: "Liquidarom — Ice Cool X — Watermelon Lemon 50 ml",
  manufacturerSlug: "liquidarom",
  manufacturerName: "Liquidarom",
  rangeSlug: "ice-cool-x",
  rangeName: "Ice Cool X",
});
assert.ok(x?.includes("watermelon-lemon"), x || "missing ice cool x");

// Ne pas matcher Ice Cool X sur Ice Cool
const cross = inferProductPackshotUrl({
  imageUrl: null,
  productName: "Liquidarom — Ice Cool — Watermelon Lemon 50 ml",
  manufacturerSlug: "liquidarom",
  manufacturerName: "Liquidarom",
  rangeSlug: "ice-cool",
  rangeName: "Ice Cool",
});
assert.equal(cross, null, "Ice Cool must not take Ice Cool X watermelon photo");

console.log("OK infer-product-packshot-url tests");
