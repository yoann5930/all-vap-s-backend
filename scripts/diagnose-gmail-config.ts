/**
 * Diagnostic récupération Gmail — aucune valeur secrète affichée.
 */
import { readFileSync, existsSync } from "fs";
import { writeFileSync } from "fs";

function loadEnv(path: string) {
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

loadEnv(".env");
loadEnv(".env.local");

async function main() {
  const { getEmailConfig } = await import("../lib/email/config");
  const { isGmailApiConfigured } = await import("../lib/email/gmail-labels");
  const { sendEmail } = await import("../lib/email/service");
  const prisma = (await import("../lib/prisma")).default;

  const c = getEmailConfig();
  const keys = [
    "SMTP_HOST",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_APP_PASSWORD",
    "MAIL_FROM_ADDRESS",
    "MAIL_ENABLED",
    "MAIL_TEST_MODE",
    "MAIL_TEST_RECIPIENT",
    "EMAIL_TRANSPORT",
    "RESEND_API_KEY",
    "ADMIN_NOTIFICATION_EMAIL",
    "GOOGLE_GMAIL_CLIENT_ID",
    "GOOGLE_GMAIL_CLIENT_SECRET",
    "GOOGLE_GMAIL_REFRESH_TOKEN",
  ];
  const presence: Record<string, string> = {};
  for (const k of keys) {
    const v = process.env[k];
    presence[k] = !v || !String(v).trim() ? "vide_ou_absente" : "presente";
  }

  let sendResult: Record<string, unknown> = {};
  try {
    const r = await sendEmail({
      to:
        process.env.MAIL_TEST_RECIPIENT ||
        process.env.ADMIN_NOTIFICATION_EMAIL ||
        "allvaps70@gmail.com",
      subject: "Diagnostic Gmail All Vap's",
      html: "<p>Test diagnostic configuration Gmail.</p>",
      text: "Test diagnostic configuration Gmail.",
      type: "admin_test",
      idempotencyKey: `gmail-recovery-diag-${Date.now()}`,
    });
    sendResult = {
      ok: true,
      transport: r.transport,
      redirectedToTest: !!r.redirectedToTest,
      messageIdSet: !!r.messageId,
      reallyDelivered: r.transport === "smtp" || r.transport === "resend",
    };
  } catch (e) {
    sendResult = {
      ok: false,
      errorCode: e && typeof e === "object" && "code" in e ? (e as { code: string }).code : "UNKNOWN",
      errorName: e instanceof Error ? e.name : "Error",
    };
  }

  const lastLog = await prisma.emailLog.findFirst({
    where: { type: "admin_test" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      transport: true,
      lastErrorCode: true,
      recipientMasked: true,
      subject: true,
      createdAt: true,
      sentAt: true,
    },
  });

  const report = {
    project: "all-vap-s-backend",
    conclusion:
      c.smtp.hasPassword || c.resendConfigured
        ? "Credentials livraison détectés"
        : "AUCUN mot de passe d application Gmail / Resend trouvé sur ce PC dans les emplacements scannés",
    appConfig: {
      enabled: c.enabled,
      configuredDeliverable: c.configured,
      smtpHasPassword: c.smtp.hasPassword,
      smtpHostSet: !!c.smtp.host,
      smtpUserSet: !!c.smtp.user,
      transport: c.transportPreference,
      testMode: c.testMode,
      testRecipientSet: !!c.testRecipient,
      fromAddress: c.fromAddress,
      adminNotifySet: !!c.adminNotificationEmail,
      gmailApiOAuth: isGmailApiConfigured(),
    },
    presence,
    sendResult,
    lastEmailLog: lastLog,
  };

  writeFileSync(
    "docs/GMAIL_CONFIG_RECOVERY_REPORT.json",
    JSON.stringify(report, null, 2),
    "utf8"
  );
  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
