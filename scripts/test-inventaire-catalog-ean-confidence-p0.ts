/**
 * P0#3 — CatalogEanMap : seuls les EAN CONFIRME résolvent un scan.
 * npx tsx scripts/test-inventaire-catalog-ean-confidence-p0.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CATALOG_EAN_MAP_TRUSTED_CONFIDENCE } from "../lib/inventory/resolve-barcode";

assert.deepEqual([...CATALOG_EAN_MAP_TRUSTED_CONFIDENCE], ["CONFIRME"]);
assert.ok(!CATALOG_EAN_MAP_TRUSTED_CONFIDENCE.includes("PROBABLE" as never));
assert.ok(!CATALOG_EAN_MAP_TRUSTED_CONFIDENCE.includes("A_VALIDER" as never));

const src = readFileSync("lib/inventory/resolve-barcode.ts", "utf8");
assert.ok(
  src.includes("CATALOG_EAN_MAP_TRUSTED_CONFIDENCE"),
  "resolve doit utiliser la constante de confiance"
);
assert.ok(
  /confidence:\s*\{\s*in:\s*\[\.\.\.CATALOG_EAN_MAP_TRUSTED_CONFIDENCE\]/.test(src) ||
    src.includes('confidence: { in: [...CATALOG_EAN_MAP_TRUSTED_CONFIDENCE] }'),
  "findFirst CatalogEanMap doit filtrer sur confidence trusted"
);
// Ne doit plus résoudre un map sans filtre confidence
const mapBlock = src.slice(src.indexOf("catalogEanMap.findFirst"));
assert.ok(mapBlock.includes("confidence"), "bloc CatalogEanMap doit mentionner confidence");
assert.equal(
  /catalogEanMap\.findFirst\(\{\s*where:\s*\{\s*ean:/.test(src) &&
    !src.includes("CATALOG_EAN_MAP_TRUSTED_CONFIDENCE"),
  false
);

console.log("OK P0#3 — CatalogEanMap resolve limité à CONFIRME");
