/**
 * P2 — Preuve transport e-mail (verify SMTP / Resend config).
 * Envoi réel optionnel: EMAIL_SMOKE_TO=adresse@domaine.fr
 */
import { readFileSync, existsSync } from "node:fs";
import assert from "node:assert/strict";

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");
  const { verifyEmailTransport } = await import("../lib/email/transport");
  const { getEmailConfig } = await import("../lib/email/config");
  const cfg = getEmailConfig();
  const verify = await verifyEmailTransport();
  console.log(
    JSON.stringify(
      {
        enabled: cfg.enabled,
        preference: cfg.transportPreference,
        verify,
      },
      null,
      2
    )
  );
  assert.equal(verify.ok, true, verify.message);

  const to = (process.env.EMAIL_SMOKE_TO || "").trim();
  if (!to) {
    console.log("SKIP envoi inbox (définir EMAIL_SMOKE_TO pour preuve livraison)");
    console.log("OK smoke-email-transport (verify)");
    return;
  }

  const { sendAdminTestEmail } = await import("../lib/email");
  const sent = await sendAdminTestEmail({ to });
  console.log(JSON.stringify({ sent: !!sent, recipientConfigured: true }, null, 2));
  console.log("OK smoke-email-transport (sent)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
