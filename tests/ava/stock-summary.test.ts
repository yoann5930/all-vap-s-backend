/**
 * AVA — stock global ≠ recherche produit
 * npx tsx tests/ava/stock-summary.test.ts
 */
import { detectAvaStockQuestion } from "../../lib/ava/stock-question";
import { understandUtterance } from "../../lib/ava/speech/understand";
import {
  formatAvaStockSummaryAnswer,
  FORBIDDEN_GLOBAL_STOCK_REPLY,
  type AvaStockSnapshot,
} from "../../lib/ava/stock-summary";

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string) {
  if (cond) {
    passed++;
    console.log(`  OK  ${label}`);
  } else {
    failed++;
    console.error(`  FAIL ${label}`);
  }
}

const snap: AvaStockSnapshot = {
  totalReferences: 100,
  totalUnits: 650,
  availableReferences: 80,
  outOfStockReferences: 20,
  stores: {
    hautmont: {
      totalReferences: 60,
      availableReferences: 50,
      outOfStockReferences: 10,
      totalUnits: 400,
    },
    leQuesnoy: {
      totalReferences: 55,
      availableReferences: 45,
      outOfStockReferences: 10,
      totalUnits: 250,
    },
  },
};

console.log("\n=== AVA stock summary vs produit ===\n");

const summaryPhrases = [
  "Tu sais combien de produits on a en stock ?",
  "Combien de produits on a en stock ?",
  "Tu sais combien on a de produits ?",
  "On a combien de stock ?",
  "Combien d'articles sont disponibles ?",
  "Combien de produits sont disponibles ?",
  "On a combien de références en stock ?",
  "Combien de produits sont en rupture ?",
  "Donne-moi un résumé du stock.",
  "Fais-moi l'état du stock.",
  "Combien on a de produits à Hautmont ?",
  "Combien on a de produits au Quesnoy ?",
  "Quel est notre stock total ?",
  "How many products do we have in stock?",
  "How much stock do we have?",
  "on a combien de produit",
  "ta combien de produit en stock",
  "niveau stock ça donne quoi",
  "y reste combien de produits",
  "combien de références",
];

assert(
  understandUtterance("Tu sais combien de produits on a en stock ?").intent === "STOCK_SUMMARY",
  "bug exact : Tu sais combien de produits on a en stock → STOCK_SUMMARY",
);
assert(
  understandUtterance("Combien de produits on a en stock ?").intent === "STOCK_SUMMARY",
  "Combien de produits on a en stock → STOCK_SUMMARY",
);
assert(
  understandUtterance("On a combien de références ?").intent === "STOCK_SUMMARY",
  "On a combien de références → STOCK_SUMMARY",
);
assert(
  understandUtterance("Combien de produits sont disponibles ?").intent === "STOCK_AVAILABLE_COUNT",
  "disponibles → STOCK_AVAILABLE_COUNT",
);
assert(
  understandUtterance("Combien sont en rupture ?").intent === "STOCK_OUT_OF_STOCK_COUNT" ||
    detectAvaStockQuestion("Combien sont en rupture ?")?.intent === "STOCK_OUT_OF_STOCK_COUNT",
  "Combien sont en rupture → STOCK_OUT_OF_STOCK_COUNT",
);
assert(
  understandUtterance("Combien de stock à Hautmont ?").intent === "STOCK_BY_STORE",
  "Combien de stock à Hautmont → STOCK_BY_STORE",
);
assert(
  understandUtterance("Et au Quesnoy ?", { lastTopic: "stock", lastStoreHint: "hautmont" }).intent ===
    "STOCK_BY_STORE",
  "Et au Quesnoy ? + contexte stock → STOCK_BY_STORE",
);
assert(
  understandUtterance("Et au Quesnoy ?", { lastTopic: "stock", lastStoreHint: "hautmont" }).entities.some(
    (e) => e.value === "le-quesnoy" || e.value === "Le Quesnoy",
  ) ||
    detectAvaStockQuestion("Et au Quesnoy ?", { lastTopic: "stock" })?.storeHint === "le-quesnoy",
  "Et au Quesnoy ? → boutique Le Quesnoy",
);
assert(
  understandUtterance("Et au total ?", { lastTopic: "stock", lastStoreHint: "hautmont" }).intent ===
    "STOCK_SUMMARY",
  "Et au total ? → STOCK_SUMMARY",
);
assert(
  understandUtterance("Vous avez de la menthe ?").intent === "PRODUCT",
  "Vous avez de la menthe ? reste PRODUCT",
);
assert(
  detectAvaStockQuestion("Vous avez de la menthe ?") === null,
  "menthe n'est pas STOCK_SUMMARY",
);
assert(
  understandUtterance("Ce produit est en stock ?", { lastProposedNames: ["Menthe polaire"] }).intent ===
    "PRODUCT_STOCK_DETAIL",
  "Ce produit est en stock ? → PRODUCT_STOCK_DETAIL",
);
assert(
  understandUtterance("Combien il reste de Menthe polaire ?").intent === "PRODUCT_STOCK_DETAIL",
  "Combien il reste de Menthe polaire → PRODUCT_STOCK_DETAIL",
);

for (const p of summaryPhrases) {
  const u = understandUtterance(p, p.toLowerCase().includes("quesnoy") && p.startsWith("Et") ? { lastTopic: "stock" } : {});
  const stockish =
    u.intent === "STOCK_SUMMARY" ||
    u.intent === "STOCK_BY_STORE" ||
    u.intent === "STOCK_OUT_OF_STOCK_COUNT" ||
    u.intent === "STOCK_AVAILABLE_COUNT";
  assert(stockish, `stock global: ${p} (got ${u.intent})`);
}

{
  const text = formatAvaStockSummaryAnswer("STOCK_SUMMARY", snap, null);
  assert(!FORBIDDEN_GLOBAL_STOCK_REPLY.test(text), "réponse globale n'est pas « pas ce produit »");
  assert(/80/.test(text) && /650/.test(text), "réponse globale cite références + unités");
  assert(/Hautmont/.test(text) && /Quesnoy/.test(text), "réponse globale cite les deux boutiques");
}

{
  const text = formatAvaStockSummaryAnswer("STOCK_BY_STORE", snap, "hautmont");
  assert(/Hautmont/.test(text), "Hautmont séparé");
  assert(/50/.test(text) && /400/.test(text), "chiffres Hautmont");
  assert(!/250/.test(text), "ne mélange pas les unités Quesnoy dans Hautmont");
}

{
  const text = formatAvaStockSummaryAnswer("STOCK_OUT_OF_STOCK_COUNT", snap, null);
  assert(/20/.test(text) && /rupture/i.test(text), "ruptures = availableQuantity 0");
}

{
  const text = formatAvaStockSummaryAnswer("STOCK_AVAILABLE_COUNT", snap, null);
  assert(/80/.test(text) && /disponibles/i.test(text), "disponibles = availableQuantity > 0");
}

{
  const empty = formatAvaStockSummaryAnswer("STOCK_SUMMARY", null, null);
  assert(/pas inventer|aucune donnée/i.test(empty), "pas de total inventé si lecture vide");
  assert(!FORBIDDEN_GLOBAL_STOCK_REPLY.test(empty), "vide ≠ pas ce produit");
}

assert(detectAvaStockQuestion("produit") === null, "le mot produit seul ≠ STOCK");
assert(detectAvaStockQuestion("avez-vous ce produit")?.intent === "PRODUCT_STOCK_DETAIL" || detectAvaStockQuestion("avez-vous ce produit") === null, "avez-vous ce produit n'est pas un total");

if (failed > 0) {
  console.error(`\n${failed} échec(s), ${passed} OK\n`);
  process.exit(1);
}
console.log(`\n${passed} tests OK\n`);
