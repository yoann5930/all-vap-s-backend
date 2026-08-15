/**
 * Classification inventaire : gammes ≠ fabricants.
 * npx tsx scripts/test-inventaire-gamme-not-fabricant.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import {
  canonicalRangeLabel,
  classifyInventoryBrandRange,
  excludeRangesFromManufacturers,
  isNonexistentBrandName,
  isRangeNotManufacturerName,
  isRangeNotManufacturerSlug,
  matchRangeNotManufacturer,
} from "../lib/catalog/ranges-not-manufacturers";
import {
  guessManufacturerFromProductName,
  matchManufacturerName,
} from "../lib/inventory/match-manufacturer";

const FAKE_MFRS = [
  { id: "1", name: "Liquide Lab", slug: "liquide-lab" },
  { id: "2", name: "e.Tasty", slug: "e-tasty" },
  { id: "3", name: "Fruity Cool", slug: "fruity-cool" },
  { id: "4", name: "Yum E-Bot", slug: "yum-ebot" },
  { id: "5", name: "Vape City", slug: "vape-city" },
  { id: "6", name: "Revenge Juices", slug: "revenge-juices" },
  { id: "7", name: "Le Maudit", slug: "le-maudit" },
  { id: "8", name: "Big Kawa", slug: "big-kawa" },
  { id: "9", name: "Raneki Liquide", slug: "raneki-liquide" },
];

const GAMME_NAMES = [
  "Yumi Bot",
  "Yum E-Bot",
  "Vapecity",
  "Vape City",
  "Revenge Juice",
  "Revenge Juices",
  "Le Maudit",
  "Fruity Cool",
  "Big Kawa",
];

for (const name of GAMME_NAMES) {
  assert.equal(isRangeNotManufacturerName(name), true, `${name} doit être une gamme`);
  assert.equal(matchManufacturerName(name, FAKE_MFRS), null, `${name} ne doit pas matcher un fabricant`);
}

assert.equal(isRangeNotManufacturerSlug("yum-ebot"), true);
assert.equal(isRangeNotManufacturerSlug("vape-city"), true);
assert.equal(isRangeNotManufacturerSlug("revenge-juices"), true);
assert.equal(isRangeNotManufacturerSlug("le-maudit"), true);
assert.equal(isRangeNotManufacturerSlug("fruity-cool"), true);
assert.equal(isRangeNotManufacturerSlug("big-kawa"), true);
assert.equal(isRangeNotManufacturerSlug("liquide-lab"), false);

assert.equal(canonicalRangeLabel("Yumi Bot"), "Yum E-Bot");
assert.equal(canonicalRangeLabel("Vapecity"), "Vape City");
assert.equal(canonicalRangeLabel("Revenge Juice"), "Revenge Juices");
assert.equal(matchRangeNotManufacturer("Fruity Cool Melon 50ml"), "Fruity Cool");
assert.equal(matchRangeNotManufacturer("Big Kawa Noisette"), "Big Kawa");

assert.equal(isNonexistentBrandName("Ravzn Juice"), true);
assert.equal(isNonexistentBrandName("Raven Juice"), true);
assert.equal(isNonexistentBrandName("ravzn"), true);
assert.equal(isRangeNotManufacturerName("Ravzn Juice"), false);
assert.equal(isRangeNotManufacturerName("Raven Juice"), false);
assert.equal(matchManufacturerName("Ravzn Juice", FAKE_MFRS), null);
assert.equal(matchManufacturerName("Raven Juice", FAKE_MFRS), null);

const filtered = excludeRangesFromManufacturers(FAKE_MFRS);
assert.deepEqual(
  filtered.map((m) => m.slug).sort(),
  ["e-tasty", "liquide-lab", "raneki-liquide"].sort()
);
assert.equal(
  filtered.some((m) => /ravzn|raven juice/i.test(m.name)),
  false
);

assert.equal(matchManufacturerName("Liquide Lab", FAKE_MFRS), "Liquide Lab");
assert.equal(matchManufacturerName("e.Tasty", FAKE_MFRS), "e.Tasty");
assert.equal(
  guessManufacturerFromProductName("Twenty Menthe Polaire e.Tasty 50ml", FAKE_MFRS),
  "e.Tasty"
);
assert.equal(
  guessManufacturerFromProductName("Fruity Cool Melon 50ml", FAKE_MFRS),
  null
);
assert.equal(
  guessManufacturerFromProductName("Big Kawa Noisette 50ml", FAKE_MFRS),
  null
);

const moved = classifyInventoryBrandRange({
  brand: "Fruity Cool",
  range: null,
  manufacturerName: "Fruity Cool",
});
assert.equal(moved.brand, null);
assert.equal(moved.range, "Fruity Cool");

const lab = classifyInventoryBrandRange({
  brand: "Big Kawa",
  range: null,
  manufacturerName: "Liquide Lab",
});
assert.equal(lab.brand, "Liquide Lab");
assert.equal(lab.range, "Big Kawa");

const keep = classifyInventoryBrandRange({
  brand: "e.Tasty",
  range: "Twenty",
  manufacturerName: "e.Tasty",
});
assert.equal(keep.brand, "e.Tasty");
assert.equal(keep.range, "Twenty");

const ghost = classifyInventoryBrandRange({
  brand: "Ravzn Juice",
  range: "Twenty",
});
assert.equal(ghost.brand, null);
assert.equal(ghost.range, "Twenty");

const extraSrc = readFileSync(
  join(__dirname, "..", "lib", "catalog", "sumup-eliquide-manufacturers.ts"),
  "utf8"
);
assert.equal(extraSrc.includes('"fruity-cool":'), false);
assert.equal(extraSrc.includes('"vape-city":'), false);
assert.equal(extraSrc.includes('"revenge-juices":'), false);
assert.equal(extraSrc.includes('"big-kawa":'), false);
assert.equal(extraSrc.includes('"yum-ebot": ["yum e-bot"'), false);
assert.equal(extraSrc.includes('"le-maudit":'), false);
assert.doesNotMatch(extraSrc, /ravzn juice|raven juice/i);

const helperSrc = readFileSync(
  join(__dirname, "..", "lib", "catalog", "ranges-not-manufacturers.ts"),
  "utf8"
);
assert.match(helperSrc, /Yumi Bot/);
assert.match(helperSrc, /Vapecity/);
assert.match(helperSrc, /Revenge Juice/);
assert.match(helperSrc, /Le Maudit/);
assert.match(helperSrc, /Fruity Cool/);
assert.match(helperSrc, /Big Kawa/);
assert.equal(helperSrc.includes("rangeName:"), true);

console.log("test-inventaire-gamme-not-fabricant: OK");
