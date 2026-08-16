/**
 * Tests du service e-mail A.V.A. (sans envoi réseau réel sauf --live).
 * Usage : npx tsx scripts/test-email-ava.ts
 * Live  : npx tsx scripts/test-email-ava.ts --live
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

/** Charge .env puis .env.local (comme Next / diagnostics) — jamais loggé. */
function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}
loadEnvFile(".env");
loadEnvFile(".env.local");

process.env.MAIL_ENABLED = "true";
process.env.MAIL_TEST_MODE = "true";
process.env.MAIL_TEST_RECIPIENT =
  process.env.MAIL_TEST_RECIPIENT || "test@example.com";
process.env.MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || "A.V.A. — All Vap's";
process.env.MAIL_FROM_ADDRESS =
  process.env.MAIL_FROM_ADDRESS || "avaallvaps@gmail.com";
process.env.APP_PUBLIC_URL = process.env.APP_PUBLIC_URL || "http://localhost:3000";
// Tests unitaires hors réseau : console. --live bascule ensuite sur smtp.
process.env.EMAIL_TRANSPORT = "console";
process.env.LOYALTY_EMAILS_ENABLED = process.env.LOYALTY_EMAILS_ENABLED || "false";

async function main() {
  const {
    getEmailConfig,
    formatFromHeader,
    assertSafeEmailAddress,
    sendEmail,
    sendAccountCreatedEmail,
    sendPasswordResetEmail,
    sendPaymentConfirmationEmail,
    sendLoyaltyPointsAddedEmail,
    EmailError,
    maskEmail,
  } = await import("../lib/email");

  let failed = 0;
  const check = (name: string, fn: () => void | Promise<void>) =>
    Promise.resolve()
      .then(fn)
      .then(() => console.log(`OK  ${name}`))
      .catch((e) => {
        failed += 1;
        console.error(`FAIL ${name}:`, e instanceof Error ? e.message : e);
      });

  await check("config from identity", () => {
    const cfg = getEmailConfig();
    assert.equal(cfg.fromAddress, "avaallvaps@gmail.com");
    assert.match(cfg.fromName, /A\.V\.A/);
    assert.match(formatFromHeader(cfg), /avaallvaps@gmail\.com/);
    assert.equal(cfg.testMode, true);
  });

  await check("mask email", () => {
    assert.equal(maskEmail("alice@allvaps.fr"), "a***@allvaps.fr");
  });

  await check("reject invalid recipient", () => {
    assert.throws(() => assertSafeEmailAddress("not-an-email"), EmailError);
  });

  await check("reject header injection", () => {
    assert.throws(() => assertSafeEmailAddress("a@b.com\nBcc:evil@x.com"), EmailError);
  });

  await check("test mode redirects + prefixes subject", async () => {
    const result = await sendEmail({
      to: "client@exemple.fr",
      subject: "Sujet client",
      html: "<p>x</p>",
      text: "x",
      type: "admin_test",
    });
    assert.equal(result.transport, "console");
    assert.equal(result.redirectedToTest, true);
  });

  await check("account created template send", async () => {
    const r = await sendAccountCreatedEmail({
      to: "nouveau@exemple.fr",
      firstName: "Alex",
      customerId: "user-test-1",
    });
    assert.ok(r.transport === "console" || r.transport === "skipped_duplicate");
  });

  await check("idempotence payment confirmation", async () => {
    const payload = {
      to: "client@exemple.fr",
      orderId: "order-idem-1",
      totalCents: 2590,
      items: [{ name: "Test 10ml", quantity: 1, priceCents: 2590 }],
    };
    const a = await sendPaymentConfirmationEmail(payload);
    const b = await sendPaymentConfirmationEmail(payload);
    assert.ok(a.transport === "console" || a.transport === "skipped_duplicate");
    // Second may be skipped_duplicate if EmailLog table exists; otherwise console again
    assert.ok(["console", "skipped_duplicate"].includes(b.transport));
  });

  await check("password reset send", async () => {
    await sendPasswordResetEmail({
      to: "client@exemple.fr",
      resetUrl: "http://localhost:3000/mot-de-passe-oublie?token=abc",
    });
  });

  await check("loyalty emails disabled", async () => {
    const r = await sendLoyaltyPointsAddedEmail({
      to: "client@exemple.fr",
      points: 10,
      customerId: "u1",
      eventId: "e1",
    });
    assert.equal(r.transport, "disabled");
  });

  await check("MAIL_ENABLED=false skips", async () => {
    process.env.MAIL_ENABLED = "false";
    // re-import config is live via env each call
    const r = await sendEmail({
      to: "client@exemple.fr",
      subject: "x",
      html: "<p>x</p>",
      text: "x",
    });
    assert.equal(r.transport, "disabled");
    process.env.MAIL_ENABLED = "true";
  });

  await check("no secret value in config dump", () => {
    const cfg = getEmailConfig();
    const dumped = JSON.stringify(cfg);
    // hasPassword (bool) est OK — aucune valeur de secret
    assert.equal(cfg.smtp.hasPassword === true || cfg.smtp.hasPassword === false, true);
    assert.ok(!dumped.includes("SMTP_APP_PASSWORD"));
    assert.ok(!/"pass"\s*:/.test(dumped));
    assert.ok(!dumped.includes(process.env.SMTP_APP_PASSWORD || "__none__") || !process.env.SMTP_APP_PASSWORD);
  });

  if (process.argv.includes("--live")) {
    await check("live SMTP verify + test mail", async () => {
      process.env.EMAIL_TRANSPORT = "smtp";
      process.env.MAIL_TEST_MODE = process.env.MAIL_TEST_MODE || "true";
      const { verifyEmailTransport, sendAdminTestEmail } = await import("../lib/email");
      const status = await verifyEmailTransport();
      console.log("  verify:", status.message, status.mode);
      assert.equal(status.ok, true, status.message);
      const to = process.env.MAIL_TEST_RECIPIENT;
      assert.ok(to, "MAIL_TEST_RECIPIENT requis pour --live");
      const sent = await sendAdminTestEmail({ to });
      console.log("  sent transport:", sent.transport);
      assert.equal(sent.transport, "smtp");
    });
  }

  if (failed) {
    console.error(`\n${failed} test(s) en échec`);
    process.exit(1);
  }
  console.log("\nTous les tests e-mail (hors live) OK.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
