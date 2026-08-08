/**
 * Smoke local (sans DB) — routage d'intention Admin A.V.A.
 * Usage: npx tsx scripts/smoke-ava-admin-tools-routing.ts
 */
import { selectAdminTools, assertCanRunAdminTools } from "../lib/ava/admin-tools";
import { AvaError } from "../lib/ava/errors";

const cases: { msg: string; expectTool?: string; expectStore?: string; unclear?: boolean }[] = [
  { msg: "Peux-tu me donner tous les rapports ?", expectTool: "getFullReport" },
  { msg: "Donne-moi tous les rapports", expectTool: "getFullReport" },
  { msg: "Fais-moi un rapport complet", expectTool: "getFullReport" },
  { msg: "Résumé du jour", expectTool: "getDailySummary" },
  { msg: "Y a-t-il des stocks faibles ?", expectTool: "getLowStockReport" },
  { msg: "Quelles commandes sont en attente ?", expectTool: "getOrdersReport" },
  { msg: "Quel est ton statut ?", expectTool: "getAvaStatus" },
  { msg: "Quels produits sont mal classés ?", expectTool: "getCatalogAudit" },
  { msg: "Que peux-tu faire ici ?", expectTool: "listCapabilities" },
  { msg: "Bonjour Ava", unclear: false },
  { msg: "asdf qwerty zxcv", unclear: true },
];

let failed = 0;
for (const c of cases) {
  const plan = selectAdminTools(c.msg);
  const okTool = c.expectTool ? plan.tools.includes(c.expectTool as never) : true;
  const okUnclear = c.unclear === true ? plan.needsClarification : c.unclear === false ? !plan.needsClarification || plan.intentLabel === "greeting" : true;
  const pass = okTool && okUnclear && !/je t'écoute/i.test(plan.clarification || "");
  if (!pass) {
    failed += 1;
    console.log("FAIL", c.msg, plan);
  } else {
    console.log("OK", c.msg, "→", plan.intentLabel, plan.tools.join(",") || "(none)");
  }
}

// Follow-up Hautmont
const follow = selectAdminTools("Et seulement Hautmont ?", [
  { role: "user", content: "Donne-moi le rapport des stocks." },
  { role: "assistant", content: "Voici les stocks..." },
]);
if (!follow.tools.includes("getLowStockReport") || follow.storeQuery !== "Hautmont") {
  failed += 1;
  console.log("FAIL follow-up Hautmont", follow);
} else {
  console.log("OK follow-up Hautmont →", follow.tools, follow.storeQuery);
}

try {
  assertCanRunAdminTools("CUSTOMER");
  failed += 1;
  console.log("FAIL client should be blocked");
} catch (e) {
  if (e instanceof AvaError) console.log("OK client blocked on admin tools");
  else {
    failed += 1;
    console.log("FAIL unexpected", e);
  }
}

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll routing smokes passed.");
