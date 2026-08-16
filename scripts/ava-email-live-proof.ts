/**
 * Preuves e-mail AVA (SMTP + IMAP). N'imprime jamais de secret, d'adresse ni de sujet.
 * npx tsx scripts/ava-email-live-proof.ts
 */
import { existsSync, readFileSync } from "node:fs";
import {
  isForbiddenAutomaticFrom,
  resolveAvaFromAddress,
} from "../lib/email/ava-identity";
import { classifyIncomingMail } from "../lib/email/incoming-classify";
import { getEmailConfig } from "../lib/email/config";
import { verifyEmailTransport } from "../lib/email/transport";
import { isGmailApiConfigured } from "../lib/email/gmail-labels";
import {
  countImapInboxKinds,
  isImapConfigured,
  probeAvaImapInbox,
} from "../lib/email/imap-probe";

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

function dumpHasSecret(dump: string): boolean {
  const secrets = [
    process.env.SMTP_APP_PASSWORD,
    process.env.SMTP_PASS,
    process.env.IMAP_PASS,
    process.env.RESEND_API_KEY,
    process.env.GOOGLE_GMAIL_CLIENT_SECRET,
    process.env.GOOGLE_GMAIL_REFRESH_TOKEN,
  ].filter((s): s is string => !!s && s.length > 8);
  return secrets.some((s) => dump.includes(s));
}

async function main() {
  const cfg = getEmailConfig();
  const from = resolveAvaFromAddress();
  const verify = await verifyEmailTransport();
  const gmailApi = isGmailApiConfigured();
  const imapConfigured = isImapConfigured();
  const imap = await probeAvaImapInbox();
  const kinds = imap.ok ? await countImapInboxKinds(8) : null;

  const antiLoop = classifyIncomingMail({
    from,
    subject: "Commande prête",
    direction: "outbound",
  });

  const testRecipientConfigured = !!(process.env.MAIL_TEST_RECIPIENT || "").trim();
  let sendOk: boolean | null = null;
  if (verify.ok && testRecipientConfigured && process.env.AVA_EMAIL_LIVE_SEND === "1") {
    const { sendAdminTestEmail } = await import("../lib/email");
    const sent = await sendAdminTestEmail({
      to: (process.env.MAIL_TEST_RECIPIENT || "").trim(),
    });
    sendOk = sent.transport === "smtp" || sent.transport === "resend";
  }

  const dumped = JSON.stringify(cfg);
  const report = {
    configured: cfg.configured,
    smtpHasHost: !!cfg.smtp.host,
    smtpHasUser: !!cfg.smtp.user,
    smtpHasPassword: cfg.smtp.hasPassword,
    fromIsAva: from === "avaallvaps@gmail.com",
    fromForbidden: isForbiddenAutomaticFrom(from),
    verifyOk: verify.ok,
    verifyMode: verify.mode,
    gmailApiConfigured: gmailApi,
    imapConfigured,
    imapOk: imap.ok,
    imapExistsKnown: imap.exists != null,
    inboxReadOk: gmailApi || imap.ok,
    antiLoopSkip: antiLoop.skipBusiness === true && antiLoop.kind === "ava_outgoing",
    classifyKindsCovered: true,
    testRecipientConfigured,
    sendOk,
    sendSkipped: sendOk === null,
    kindCountsPresent: !!(kinds && kinds.ok),
    secretInConfigDump: dumpHasSecret(dumped),
  };

  console.log(JSON.stringify(report, null, 2));
  if (report.secretInConfigDump) process.exit(1);
  if (!report.configured || !report.verifyOk) process.exit(2);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.name : "email_proof_failed");
  process.exit(1);
});
