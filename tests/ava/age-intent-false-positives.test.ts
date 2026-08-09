/**
 * Non-régression critique : faux positifs âge / mineur = 0
 * npm exec tsx tests/ava/age-intent-false-positives.test.ts
 */
import { detectAgeIntent, isAgeConfirmed } from "../../lib/ai/ava/age-intent";
import {
  detectClientIntent,
  isSocialGreeting,
  isSocialSmalltalk,
} from "../../lib/ai/ava/client-intent-router";
import { parseDeviceFromMessage } from "../../lib/ai/ava/conversation-engine";
import { mergeContextFromMessage } from "../../lib/ai/ava/conversation-context";
import { emptyConversationContext } from "../../lib/ai/ava/types";
import { resolveCanonicalProductKind } from "../../lib/catalog/product-advice-profile";
import { resolveEntity } from "../../lib/ai/ava/device-exact-match";
import { adminProductGuard } from "../../lib/catalog/admin-guards";

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

console.log("\n=== AGE INTENT — faux positifs ===");
const mustStayUnknown = [
  "je me suis trompé",
  "Non, je me suis trompé : c'est un Geekvape Aegis Legend 2 avec un Z Subohm.",
  "non c'est une Legend 2",
  "c'est une Legend 2",
  "XROS 4 pas XROS 3",
  "non c'est une XROS 4",
  "Vaporesso XROS 4",
  "Gen 200",
  "0.15",
  "0.15 ohm",
  "18 mg",
  "je veux du 18 mg",
  "pas 18 mg",
  "c'est mon père qui m'envoie",
  "c'est mon père qui vapote",
  "Non",
  "Oui",
  "salut",
  "ça va ?",
  "résistance pour Vaporesso XROS 4",
];
for (const msg of mustStayUnknown) {
  assert(detectAgeIntent(msg) === "unknown", `unknown: ${msg.slice(0, 60)}`);
  assert(isAgeConfirmed(msg) === null, `null confirm: ${msg.slice(0, 40)}`);
}

console.log("\n=== AGE INTENT — vrais signaux ===");
assert(detectAgeIntent("j'ai 17 ans") === "underage", "17 ans → underage");
assert(detectAgeIntent("Je suis mineur") === "underage", "mineur");
assert(detectAgeIntent("j'ai moins de 18 ans") === "underage", "moins de 18");
assert(detectAgeIntent("j'ai 18 ans") === "adult", "18 ans → adult");
assert(detectAgeIntent("je suis majeur") === "adult", "majeur");
assert(detectAgeIntent("j'ai 17 ans et une XROS 4") === "underage", "17 + produit");
assert(detectAgeIntent("j'ai 19 ans, je cherche une XROS 4") === "adult", "19 + produit");

console.log("\n=== ROUTER SOCIAL ===");
assert(isSocialGreeting("salut") === true, "salut greeting");
assert(detectClientIntent("salut", null) === "SOCIAL_GREETING", "intent salut");
assert(isSocialSmalltalk("Ça va ?") === true, "ça va smalltalk");
assert(detectClientIntent("Ça va ?", null) === "SOCIAL_SMALLTALK", "intent ça va");
assert(
  detectClientIntent(
    "Non, je me suis trompé : c'est un Geekvape Aegis Legend 2",
    null
  ) === "CORRECTION",
  "intent correction"
);

console.log("\n=== MATÉRIEL / CONTRAINTES ===");
assert(
  parseDeviceFromMessage("résistance pour Vaporesso XROS 4").deviceModel === "XROS 4",
  "XROS 4 exact"
);
{
  const prev = emptyConversationContext(null);
  prev.deviceModel = "XROS 3";
  prev.manufacturer = "Vaporesso";
  const merged = mergeContextFromMessage(
    prev,
    "Non, je me suis trompé : c'est un Geekvape Aegis Legend 2 avec un Z Subohm."
  );
  assert(merged.context.deviceModel === "Aegis Legend 2", "correction → Legend 2");
}
{
  let ctx = emptyConversationContext(null);
  ctx = mergeContextFromMessage(ctx, "je veux du fruité").context;
  ctx = mergeContextFromMessage(ctx, "pas trop frais").context;
  const final = mergeContextFromMessage(ctx, "plutôt en 50 ml");
  assert(Boolean(final.context.flavorFamily), "flavor kept");
  assert(final.context.freshness === "without", "freshness without");
  assert(final.context.volumeMl === 50, "volume 50");
}

console.log("\n=== TAXONOMIE ===");
assert(
  resolveCanonicalProductKind({
    name: "Concentré Enfer Original 30 ml",
    category: "diy",
    productType: "concentré",
  }) === "DIY_CONCENTRATE",
  "concentré"
);
assert(
  resolveCanonicalProductKind({
    name: "Enfer Original 50 ml",
    category: "e-liquides",
    format: "50ml",
  }) === "ELIQUID",
  "eliquid"
);

console.log("\n=== PACK WORK — exact match + supersede + prix ===");
{
  const entities = [
    { id: "1", name: "XROS 4", aliases: ["xros4", "vaporesso xros 4"] },
    { id: "2", name: "XROS 3", aliases: ["xros3"] },
  ];
  assert(resolveEntity("XROS 4", entities).kind === "EXACT", "exact XROS 4");
  assert(resolveEntity("XROS 4", entities).entity?.name === "XROS 4", "not XROS 3");
  assert(resolveEntity("xros4", entities).kind === "ALIAS", "alias");
}
{
  const prev = emptyConversationContext(null);
  prev.deviceModel = "XROS 3";
  const merged = mergeContextFromMessage(prev, "non c'est une XROS 4");
  assert(merged.context.deviceModel === "XROS 4", "device → XROS 4");
  assert(
    (merged.context.superseded.deviceModel || []).includes("XROS 3"),
    "XROS 3 superseded"
  );
}
assert(
  adminProductGuard({ active: true, priceCents: 0 }) === "PRODUCT_REVIEW_REQUIRED",
  "prix 0 → review"
);
assert(adminProductGuard({ active: true, priceCents: 1290 }) === "OK", "prix OK");

console.log(`\n=== RESULT ${passed} passed / ${failed} failed ===`);
if (failed > 0) process.exit(1);
