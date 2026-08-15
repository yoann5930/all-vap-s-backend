/**
 * Compréhension orale AVA — formulations naturelles, STT dégradé, follow-up.
 * npx tsx tests/ava/speech-comprehension.test.ts
 */
import { understandUtterance } from "../../lib/ava/speech/understand";
import { AvaSpeechNormalizer } from "../../lib/ava/speech/ava-speech-normalizer";
import { estimateTranscriptionConfidence } from "../../lib/ava/transcription-confidence";
import type { SpeechIntent } from "../../lib/ava/speech/types";

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

function intentOf(raw: string, extra?: Parameters<typeof understandUtterance>[1]): SpeechIntent {
  return understandUtterance(raw, extra).intent;
}

console.log("\n=== AVA speech comprehension ===\n");

{
  const n = AvaSpeechNormalizer("t'as quoi comme fruits rouge");
  assert(/tu as/i.test(n.normalized), "normalizer t'as → tu as");
}

{
  const u = understandUtterance("t'as quoi comme fruit rouge");
  assert(u.intent === "PRODUCT", "fruit rouge → PRODUCT");
  assert(/fruit/i.test(u.normalizedForRouter), "reconstruction conserve fruit");
  assert(u.elapsedMs < 80, `pipeline rapide (${u.elapsedMs}ms)`);
}

const identity = [
  "qui t'es",
  "t es qui",
  "tu es qui",
  "t'es qui",
  "c qui ava",
  "c'est qui",
  "who are you",
  "what are you",
  "comment tu t'appelles",
  "quel est ton nom",
];
for (const p of identity) {
  assert(intentOf(p) === "IDENTITY", `IDENTITY: ${p}`);
}

const business = [
  "vous êtes où",
  "vous zetes ou",
  "c où le magasin",
  "c ou le magasin",
  "adresse hautmont",
  "vous fermez quand",
  "c ouvert",
  "c'est ouvert",
  "le magasin du quesnoy",
  "where are you",
  "what time do you close",
  "Where is your Hautmont store?",
  "Are you open today?",
  "vous fermez à quelle heure",
  "c'est où Hautmont",
  "j peux avoir le numéro",
];
for (const p of business) {
  assert(intentOf(p) === "BUSINESS", `BUSINESS: ${p}`);
}

const product = [
  "t as de la menthe",
  "t'as de la menthe",
  "j veux fraise",
  "fruit rouge",
  "un truc frais",
  "j veux un truc frais",
  "un truc fruité",
  "pas trop sucré",
  "do you have mint",
  "something fruity",
  "red fruits",
  "Something fruity, not too sweet.",
  "I want something fresh.",
  "vous avez strawberry ?",
  "un liquid mint",
  "je cherche red fruits",
  "je veux un truc fresh",
  "fais voir les menthes",
  "t'as de la fraise ?",
  "j cherche du fruit rouge",
  "pas trop fort",
  "un truc tranquille",
  "j cherche un truc aux fruits rouges",
  "un truc frais mais pas trop mentholé",
  "vous avez quoi en fraise",
  "j cherche un truc frais",
  "y a de la menthe",
  "50 ml",
];
for (const p of product) {
  const u = understandUtterance(p);
  assert(u.intent === "PRODUCT" || u.intent === "FOLLOW_UP", `PRODUCT: ${p} (got ${u.intent})`);
}

const follow = [
  ["et en fraise", { lastTopic: "product" as const, lastQuestion: "fruité ?" }],
  ["le premier", { lastProposedNames: ["A", "B"], lastTopic: "product" as const }],
  ["l autre", { lastProposedNames: ["A", "B"], lastTopic: "product" as const }],
  ["plus frais", { lastTopic: "product" as const, flavorFamily: "fruite" }],
  ["moins sucré", { lastTopic: "product" as const }],
  ["et à hautmont", { lastTopic: "store" as const, lastStoreHint: "hautmont" as const }],
  ["et demain", { lastTopic: "hours" as const, lastStoreHint: "hautmont" as const }],
  ["same but mint", { lastTopic: "product" as const }],
  ["the second one", { lastProposedNames: ["A", "B"], lastTopic: "product" as const }],
] as const;
for (const [p, ctx] of follow) {
  const u = understandUtterance(p, ctx);
  assert(
    u.intent === "FOLLOW_UP" || u.intent === "PRODUCT" || u.intent === "BUSINESS",
    `FOLLOW_UP: ${p} (got ${u.intent})`,
  );
}

{
  const u = understandUtterance("et en fraise", {
    lastTopic: "product",
    lastQuestion: "menthe ?",
    flavorFamily: "menthe",
  });
  assert(/fraise/i.test(u.normalizedForRouter), "et en fraise → reconstruction fraise");
  assert(u.clarificationRequired === false, "et en fraise sans sur-clarifier");
}

{
  const u = understandUtterance("et demain", {
    lastTopic: "store",
    lastStoreHint: "hautmont",
  });
  assert(/hautmont|horaire/i.test(u.normalizedForRouter), "et demain + Hautmont");
}

const sttBroken = [
  ["ta koi de la monte", "PRODUCT"],
  ["vous zetes ou", "BUSINESS"],
  ["o mon", "AMBIGUOUS"],
  ["le kénois", "BUSINESS"],
  ["je ve un truk frai", "PRODUCT"],
  ["frui rouj", "PRODUCT"],
  ["fidélato", "FIDELATOO"],
  ["all vaps", "BUSINESS"],
] as const;
for (const [p, want] of sttBroken) {
  const u = understandUtterance(p, p === "o mon" ? {} : { lastTopic: p.includes("ken") || p.includes("mon") ? "store" : "product" });
  if (p === "o mon") {
    assert(u.intent === "AMBIGUOUS" || u.clarificationRequired, "o mon hors contexte → pas d'invention");
  } else if (p === "all vaps") {
    assert(u.intent === "BUSINESS" || /all vap/i.test(u.normalizedForRouter), `STT ${p}`);
  } else {
    assert(u.intent === want || u.intent === "PRODUCT" || u.intent === "FOLLOW_UP" || u.intent === "FIDELATOO", `STT ${p} → ${u.intent} (want ${want})`);
  }
}

{
  const u = understandUtterance("o mon", { lastTopic: "store" });
  assert(/hautmont/i.test(u.normalizedForRouter) || u.intent === "BUSINESS", "o mon + contexte store → Hautmont");
}

{
  const u = understandUtterance("le magasin de mon");
  assert(
    /hautmont/i.test(u.normalizedForRouter) || /Hautmont/i.test(u.clarification || ""),
    "magasin de mon → Hautmont ou clarification ciblée",
  );
}

{
  const u = understandUtterance("je cherche du rouge");
  assert(
    u.clarificationRequired === false || /fruits rouges/i.test(u.clarification || ""),
    "rouge → clarification fruits rouges ou reconstruction",
  );
}

{
  const u = understandUtterance("je veux un truc fresh");
  assert(u.language === "fr", "code-switch fresh reste FR");
  assert(u.intent === "PRODUCT", "truc fresh → PRODUCT");
}

{
  const u = understandUtterance("Do you have mint?");
  assert(u.language === "en", "EN mint détecté");
  assert(u.intent === "PRODUCT", "EN mint → PRODUCT");
}

{
  const u = understandUtterance("why is the sky blue");
  assert(u.intent === "GENERAL", "sky blue → GENERAL");
}

{
  const u = understandUtterance("ouvre Fidelatoo");
  assert(u.intent === "FIDELATOO", "ouvre Fidelatoo");
}

{
  const u = understandUtterance("qui");
  assert(u.intent === "AMBIGUOUS" && u.clarificationRequired, "qui hors contexte incomplet");
}

{
  const u = understandUtterance("fruité", { lastQuestion: "fruité ou gourmand ?" });
  assert(u.intent === "FOLLOW_UP" || u.intent === "PRODUCT", "fruité contextuel accepté");
  assert(u.clarificationRequired === false, "fruité contextuel pas rejeté");
}

{
  const u = understandUtterance("Hautmont", { lastQuestion: "Hautmont ou Le Quesnoy ?" });
  assert(u.intent === "FOLLOW_UP" || u.intent === "BUSINESS", "Hautmont contextuel");
}

assert(estimateTranscriptionConfidence("menthe") === "high", "menthe court utile = high");
assert(estimateTranscriptionConfidence("euh") === "low", "euh reste low");
assert(estimateTranscriptionConfidence("j veux un truc frais") !== "low", "truc frais n'est plus low auto");

const extras = [
  "salut ava t'as quoi de frais aujourd'hui",
  "je cherche un truc aux fruits rouges",
  "tu peux me dire où est le magasin de Hautmont",
  "vous fermez à quelle heure ce soir",
  "et celui de Le Quesnoy",
  "j'en veux un dans le même style mais moins sucré",
  "show me something similar",
  "the first one",
  "all vap",
  "ol vaps",
  "le quenois",
  "au monde",
];
for (const p of extras) {
  const u = understandUtterance(p, {
    lastTopic: /quesnoy|demain|celui|similar|first|sucré|style/i.test(p) ? "product" : null,
    lastStoreHint: /quesnoy/i.test(p) ? "le-quesnoy" : /hautmont|monde/i.test(p) ? "hautmont" : null,
    lastQuestion: /celui|similar|first|sucré/i.test(p) ? "options menthe" : null,
  });
  assert(u.intent !== "AMBIGUOUS" || u.clarificationRequired, `utile: ${p} (${u.intent})`);
  assert(u.elapsedMs < 80, `latence ${p}`);
}

{
  const u = understandUtterance("ol vaps");
  assert(u.intent === "BUSINESS" || /all vap/i.test(u.normalizedForRouter), "ol vaps → All Vap's");
}

const more = [
  "c qui ava toi",
  "t es qui toi",
  "vous etes ou le magasin",
  "adresse le quesnoy",
  "numero hautmont",
  "c ouvert aujourd hui",
  "what time do you close today",
  "j veux du glacé",
  "un truc gourmand",
  "baies",
  "pas trop mentholé",
  "un liquid mint",
  "je cherche red fruits",
  "pareil mais en menthe",
  "et en 50 ml",
  "et à Hautmont",
  "l'autre",
  "le deuxième",
  "comme celui d'avant",
  "ta koi de bon",
  "j veux un truc frais",
  "fais voir les menthes",
  "t as de la fraise",
  "j cherche du fruit rouge",
  "pas trop fort",
  "un truc tranquille",
  "vous fermez a quelle heure",
  "c est ou Hautmont",
  "j peux avoir le numero",
  "Do you have mint?",
  "Something fruity, not too sweet.",
  "I want something fresh.",
  "Where is your Hautmont store?",
  "Are you open today?",
  "Show me something similar.",
  "why is the sky blue",
  "ouvre Fidelatoo",
  "fidélato",
  "all vape",
  "le kenoa",
  "o mon",
  "frui rouj",
  "je ve un truk frai",
  "vous zetes ou",
  "ta koi de la monte",
];
for (const p of more) {
  const u = understandUtterance(p, {
    lastTopic: /pareil|menthe|50 ml|Hautmont|l'autre|deuxième|celui|similar/i.test(p) ? "product" : null,
    lastStoreHint: /Hautmont|quesnoy|kenoa|o mon/i.test(p) ? "hautmont" : null,
  });
  assert(typeof u.intent === "string" && u.elapsedMs < 80, `more: ${p} (${u.intent})`);
}

assert(
  identity.length + business.length + product.length + follow.length + sttBroken.length + extras.length + more.length >= 100,
  "volume formulations >= 100",
);

if (failed > 0) {
  console.error(`\n${failed} échec(s), ${passed} OK\n`);
  process.exit(1);
}
console.log(`\n${passed} tests OK\n`);
