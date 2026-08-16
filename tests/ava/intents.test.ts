import { classifyAvaIntent, classifyAvaNeed } from "../../lib/ava/intents";

let fail = 0;
function assert(cond: boolean, label: string) {
  if (!cond) {
    fail++;
    console.error("FAIL", label);
  } else {
    console.log("OK", label);
  }
}

assert(classifyAvaNeed("Vous avez de la menthe ?") === "PRODUCT", "menthe=PRODUCT");
assert(classifyAvaNeed("C'est quoi le CA du jour ?") === "ADMIN_OPS", "CA=ADMIN_OPS");
assert(classifyAvaIntent("AVA, fais ton check-up") === "SYSTEM_HEALTH", "checkup");
assert(classifyAvaIntent("AVA teste ton système") === "SYSTEM_HEALTH", "teste systeme");
assert(classifyAvaIntent("Combien de commandes à préparer ?") === "ORDER", "order prepare");
assert(classifyAvaIntent("Quelles commandes sont prêtes ?") === "ORDER", "order ready");
assert(classifyAvaIntent("Combien il reste à Hautmont ?") === "STOCK", "stock hautmont");
assert(classifyAvaIntent("Et au Quesnoy, le stock ?") === "STOCK", "stock quesnoy");
assert(classifyAvaIntent("Ta boîte mail fonctionne ?") === "EMAIL", "email");
assert(classifyAvaIntent("Chronopost est configuré ?") === "SHIPPING", "shipping");
assert(classifyAvaIntent("Pourquoi le ciel est bleu ?") === "GENERAL", "general");
assert(classifyAvaNeed("Le site All Vap's fonctionne ?") === "SITE", "site health stays SITE");

if (fail) process.exit(1);
console.log("OK intents");
