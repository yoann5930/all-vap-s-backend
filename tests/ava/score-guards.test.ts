import { classifyAvaIntent, needsServerBusinessTool } from "../../lib/ava/intents";
import { detectStockScope, AVA_STOCK_UNAVAILABLE, AVA_STOCK_UNIDENTIFIED } from "../../lib/ava/tools/stock-query";
import { detectOrderFocus } from "../../lib/ava/tools/order-query";
import { classifyIncomingMail, shouldIgnoreIncomingAsBusiness } from "../../lib/email/incoming-classify";
import { getAvaMailboxAddress } from "../../lib/email/ava-identity";
import { formatSpoken, type AvaCheckItem } from "../../lib/ava/health/checkup";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let fail = 0;
function assert(cond: boolean, label: string) {
  if (!cond) {
    fail++;
    console.error("FAIL", label);
  } else console.log("OK", label);
}

assert(detectStockScope("Combien il reste à Hautmont ?") === "HAUTMONT", "scope hautmont");
assert(detectStockScope("Et au Quesnoy, le stock ?") === "LE_QUESNOY", "scope quesnoy");
assert(detectStockScope("Il reste du stock ?") === "GLOBAL", "scope global");
assert(AVA_STOCK_UNAVAILABLE.includes("n'ai pas pu vérifier"), "stock fail phrase");
assert(AVA_STOCK_UNIDENTIFIED.includes("n'ai pas identifié"), "stock unidentified phrase");

assert(detectOrderFocus("Quelles commandes sont prêtes ?") === "ready", "order ready");
assert(detectOrderFocus("Combien de commandes à préparer ?") === "prepare", "order prepare");
assert(detectOrderFocus("Commandes en préparation") === "preparing", "order preparing");
assert(detectOrderFocus("La dernière commande") === "latest", "order latest");
assert(detectOrderFocus("Commandes en retard") === "late", "order late");

assert(classifyAvaIntent("C'est quoi le PG/VG ?") === "VAPE_KNOWLEDGE", "vape pgvg");
assert(classifyAvaIntent("C'est quoi le MTL ?") === "VAPE_KNOWLEDGE", "vape mtl");
assert(needsServerBusinessTool("VAPE_KNOWLEDGE"), "vape goes to server tools");
assert(needsServerBusinessTool("SITE"), "site health server");

const selfMail = classifyIncomingMail({
  from: getAvaMailboxAddress(),
  subject: "Commande prête",
});
assert(selfMail.skipBusiness === true, "ava outgoing skip");
assert(selfMail.kind === "ava_outgoing", "ava outgoing kind");
assert(
  shouldIgnoreIncomingAsBusiness({
    headers: { "Auto-Submitted": "auto-replied" },
    from: "noreply@example.com",
  }),
  "auto-submitted skip",
);
assert(
  classifyIncomingMail({ from: "client@example.com", subject: "Ma commande" }).skipBusiness === false,
  "customer not skipped",
);
assert(
  classifyIncomingMail({ from: "suivi@mondialrelay.fr", subject: "Mondial Relay" }).kind === "carrier",
  "carrier classified",
);
assert(
  classifyIncomingMail({
    from: "noreply@allvaps.fr",
    subject: "Nouvelle commande payée",
  }).kind === "order",
  "order classified",
);
assert(
  classifyIncomingMail({
    from: "mailer-daemon@googlemail.com",
    subject: "Delivery Status Notification (Failure)",
  }).kind === "error",
  "error classified",
);
assert(
  classifyIncomingMail({
    from: "client@example.com",
    subject: "Ma commande",
  }).kind === "customer",
  "customer vs order",
);

const spoken = formatSpoken([
  {
    module: "E-mail",
    status: "NOT_CONFIGURED",
    latencyMs: 1,
    message: "missing_credentials",
    timestamp: new Date().toISOString(),
  } satisfies AvaCheckItem,
  {
    module: "Fidelatoo",
    status: "DEGRADED",
    latencyMs: 1,
    message: "demo",
    timestamp: new Date().toISOString(),
  },
]);
assert(spoken.startsWith("Check-up terminé."), "checkup prefix");
assert(!/tout fonctionne/i.test(spoken), "never tout fonctionne");
assert(spoken.includes("non configuré"), "honest not configured");
assert(spoken.includes("dégradé"), "honest degraded");

const faq = JSON.parse(
  readFileSync(join(process.cwd(), "data/ava/knowledge/faq.json"), "utf8"),
) as { faq: Array<{ tags?: string[] }> };
const tags = new Set(faq.faq.flatMap((e) => e.tags || []));
for (const need of ["histoire", "nicotine", "legislation", "securite", "entretien", "e-liquides"]) {
  assert(tags.has(need), `faq tag ${need}`);
}

if (fail) process.exit(1);
console.log("OK score-guards");
