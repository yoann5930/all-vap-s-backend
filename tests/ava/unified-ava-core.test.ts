/**
 * Identité unique AVA — pas de vitest dans ce dépôt admin.
 */
import { readFileSync } from "node:fs";
import { AVA_IDENTITY_SPOKEN, AVA_SYSTEM_ID, avaSystemPrompt, isAvaSelfIntro } from "../../lib/ava/ava-core";
import { personIdFromEmail, personIdFromEmployee, extractMemorizeFact } from "../../lib/ava/shared-memory";
import { classifyAvaNeed } from "../../lib/ava/unified-brain";

const brainSrc = readFileSync("lib/ava/unified-brain.ts", "utf8");

let fail = 0;
function assert(cond: boolean, label: string) {
  if (!cond) {
    fail++;
    console.error("FAIL", label);
  } else {
    console.log("OK", label);
  }
}

assert(AVA_SYSTEM_ID === "ava-main", "system id");
assert(isAvaSelfIntro("Qui es-tu ?"), "qui es-tu android");
assert(isAvaSelfIntro("Présente-toi"), "presente-toi");
assert(!isAvaSelfIntro("Qui suis-je ?"), "qui suis-je n'est pas l'identité AVA");
assert(AVA_IDENTITY_SPOKEN.includes("AVA") && AVA_IDENTITY_SPOKEN.includes("Yoann"), "identité parlée");
assert(avaSystemPrompt("ANDROID").includes(AVA_SYSTEM_ID), "prompt android");
assert(avaSystemPrompt("ADMIN_WEB").includes(AVA_SYSTEM_ID), "prompt admin");
assert(avaSystemPrompt("ANDROID") === avaSystemPrompt("ANDROID"), "prompt stable");
assert(personIdFromEmployee("yoann") === "yoann", "employee yoann");
assert(personIdFromEmployee(null) === "unknown", "anonyme = unknown");
assert(personIdFromEmployee("client-android") === "unknown", "employeeId client ignoré");
assert(personIdFromEmail("yoann@allvaps.fr") === "yoann", "email yoann");
assert(avaSystemPrompt("ADMIN_WEB").includes("site admin"), "canal admin");
assert(avaSystemPrompt("ANDROID").includes("Android"), "canal android");
assert(classifyAvaNeed("Pourquoi le ciel est bleu ?") === "GENERAL", "ciel bleu = général");
assert(classifyAvaNeed("C'est quoi une fraise ?") === "GENERAL", "définition fraise = général");
assert(classifyAvaNeed("Je cherche un fruit rouge.") === "PRODUCT", "fruit rouge = catalogue");
assert(classifyAvaNeed("Vous avez de la menthe ?") === "PRODUCT", "vous avez menthe = catalogue");
assert(classifyAvaNeed("T'as de la fraise ?") === "PRODUCT", "t'as fraise = catalogue");
assert(classifyAvaNeed("Il me faut un puff") === "PRODUCT", "puff demandé = catalogue");
assert(classifyAvaNeed("Un liquide fruité s'il te plaît") === "PRODUCT", "liquide fruité = catalogue");
assert(classifyAvaNeed("Est-ce que ce liquide fraise est disponible ?") === "PRODUCT", "disponible = stock lecture");
assert(classifyAvaNeed("Vous êtes ouvert ?") === "BUSINESS", "ouvert = boutique");
assert(classifyAvaNeed("Où vous êtes ?") === "BUSINESS", "où vous êtes = boutique");
assert(classifyAvaNeed("Recherche sur Internet une information récente.") === "WEB", "internet = outil interne");
assert(Boolean(extractMemorizeFact("Pour ce test, retiens le mot ORANGE.")), "retiens ORANGE = mémoire");
assert(classifyAvaNeed("Pour ce test, retiens le mot ORANGE.") === "MEMORY", "retiens = intent MEMORY");
assert(!extractMemorizeFact("Quel est mon mot de test ?"), "rappel n'est pas une écriture");
assert(!brainSrc.includes("apply-stock"), "cerveau sans apply-stock");
assert(!brainSrc.includes("applyStoreSale"), "cerveau sans applyStoreSale");
assert(!brainSrc.includes("writeInventory"), "cerveau sans writeInventory");
assert(!brainSrc.includes("StockLevel"), "cerveau sans mutation StockLevel");
assert(brainSrc.includes("searchProducts"), "cerveau catalogue réel");
assert(brainSrc.includes("searchWebForAva"), "cerveau internet réel");
assert(brainSrc.includes("@/lib/ava/production-llm"), "LLM production OpenAI");
assert(!brainSrc.includes("providers/router"), "pas de routeur Ollama local");

if (fail) process.exit(1);
console.log("OK unified AVA core");
