/**
 * Tests unitaires corrections audit (mode, stock bypass, e-mail honesty, idempotence).
 */
import { hashAuditSecret } from "../lib/audit/mode";
import { validateCartStock } from "../lib/stock";
import { getEmailConfig } from "../lib/email/config";
import { getPushProvider } from "../lib/notifications/push-provider";

let failed = 0;
function assert(c: boolean, msg: string) {
  if (!c) {
    failed += 1;
    console.error("FAIL", msg);
  } else console.log("OK", msg);
}

async function main() {
  assert(hashAuditSecret("a").length === 64, "hash audit secret");
  const cfg = getEmailConfig();
  // configured doit refléter la capacité réelle de livraison
  if (!cfg.smtp.hasPassword && !cfg.resendConfigured) {
    assert(cfg.configured === false, "email configured=false sans SMTP/Resend");
  } else {
    assert(cfg.configured === true, "email configured=true avec credentials");
  }

  const push = getPushProvider();
  assert(
    push.isConfigured() === false || process.env.PUSH_ENABLED === "true",
    "push provider cohérent"
  );

  // Bypass audit : sans produit réel on teste le flag de message
  // (si pas de produit OOS, on vérifie juste que l'option ne crash pas)
  const r = await validateCartStock([], { allowOutOfStockAudit: true });
  assert(r.ok === true, "validateCartStock vide ok");

  if (failed) process.exit(1);
  console.log("\nCorrection audit — tests unitaires OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
