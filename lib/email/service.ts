import { getEmailConfig } from "./config";
import { EmailError } from "./errors";
import { createEmailLog, findSuccessfulEmailLog, markEmailLog } from "./log";
import { maskEmail } from "./mask";
import { sendViaConsole, sendViaResend, sendViaSmtp } from "./transport";
import type { EmailPayload, SendEmailResult } from "./types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function assertSafeEmailAddress(email: string): string {
  const cleaned = (email || "").trim().toLowerCase();
  if (!cleaned || cleaned.length > 254 || !EMAIL_RE.test(cleaned)) {
    throw new EmailError("Adresse e-mail invalide", "INVALID_RECIPIENT");
  }
  if (/[\r\n]/.test(email) || /[\r\n]/.test(cleaned)) {
    throw new EmailError("Adresse e-mail invalide", "HEADER_INJECTION");
  }
  return cleaned;
}

function assertSafeHeaderValue(value: string, field: string): string {
  if (/[\r\n]/.test(value)) {
    throw new EmailError(`Valeur invalide (${field})`, "HEADER_INJECTION");
  }
  return value;
}

/**
 * Envoi centralisé — unique point d'entrée SMTP/Resend/console.
 */
export async function sendEmail(payload: EmailPayload): Promise<SendEmailResult> {
  const cfg = getEmailConfig();

  if (!cfg.enabled) {
    await createEmailLog({
      type: payload.type || "generic",
      recipient: payload.to,
      subject: payload.subject,
      relatedOrderId: payload.relatedOrderId,
      relatedCustomerId: payload.relatedCustomerId,
      idempotencyKey: payload.idempotencyKey,
      status: "SKIPPED",
      lastErrorCode: "EMAIL_DISABLED",
      transport: "disabled",
    });
    return { transport: "disabled" };
  }

  if (payload.idempotencyKey) {
    const existing = await findSuccessfulEmailLog(payload.idempotencyKey);
    if (existing) {
      return { transport: "skipped_duplicate" };
    }
  }

  const intendedTo = assertSafeEmailAddress(payload.to);
  let finalTo = intendedTo;
  let redirectedToTest = false;
  let subject = assertSafeHeaderValue(payload.subject, "subject");
  const bccRaw = (payload.bcc || [])
    .map((b) => {
      try {
        return assertSafeEmailAddress(b);
      } catch {
        return null;
      }
    })
    .filter((b): b is string => !!b);

  if (payload.isAudit || payload.auditCampaignId) {
    const prefix = `[AUDIT ALL VAP'S — TEST]`;
    if (!subject.startsWith(prefix)) {
      subject = `${prefix} ${subject}`;
    }
    if (payload.auditCampaignId && !subject.includes(payload.auditCampaignId)) {
      subject = `${subject} · ${payload.auditCampaignId}`;
    }
  }

  if (cfg.testMode) {
    if (!cfg.testRecipient) {
      throw new EmailError(
        "Mode test actif : destinataire de test manquant",
        "TEST_RECIPIENT_REQUIRED"
      );
    }
    finalTo = assertSafeEmailAddress(cfg.testRecipient);
    redirectedToTest = true;
    if (!subject.startsWith("[TEST]")) {
      subject = `[TEST] All Vap's — ${subject}`;
    }
  }

  // BCC : jamais le même que TO ; en mode test, une seule boîte cible
  const finalBcc = redirectedToTest
    ? []
    : [...new Set(bccRaw.filter((b) => b !== finalTo))];

  const html = payload.html;
  const text = payload.text;
  const log = await createEmailLog({
    type: payload.type || "generic",
    recipient: intendedTo,
    subject,
    relatedOrderId: payload.relatedOrderId,
    relatedCustomerId: payload.relatedCustomerId,
    idempotencyKey: payload.idempotencyKey,
    status: "PENDING",
  });

  const mail: EmailPayload = {
    ...payload,
    to: finalTo,
    bcc: finalBcc.length ? finalBcc : undefined,
    subject,
    html,
    text,
  };

  try {
    const preferred = cfg.transportPreference;

    if (preferred === "console") {
      const isLocal = /localhost|127\.0\.0\.1/i.test(cfg.publicUrl);
      if (!isLocal && process.env.NODE_ENV === "production") {
        throw new EmailError(
          "EMAIL_TRANSPORT=console interdit en production",
          "EMAIL_NOT_CONFIGURED"
        );
      }
      await sendViaConsole(mail);
      // Console ≠ livraison réelle — ne jamais marquer SENT
      await markEmailLog(log?.id, {
        status: "SKIPPED",
        transport: "console",
        lastErrorCode: "CONSOLE_ONLY_NOT_DELIVERED",
      });
      return { transport: "console", redirectedToTest };
    }

    if (preferred === "resend" || (preferred === "auto" && cfg.resendConfigured && !cfg.smtp.hasPassword)) {
      const info = await sendViaResend(mail);
      await markEmailLog(log?.id, { status: "SENT", transport: "resend" });
      return { transport: "resend", messageId: info.messageId, redirectedToTest };
    }

    if (
      preferred === "smtp" ||
      (preferred === "auto" && cfg.smtp.hasPassword && cfg.smtp.host)
    ) {
      const info = await sendViaSmtp(mail);
      await markEmailLog(log?.id, { status: "SENT", transport: "smtp" });
      return { transport: "smtp", messageId: info.messageId, redirectedToTest };
    }

    if (preferred === "auto" && cfg.resendConfigured) {
      const info = await sendViaResend(mail);
      await markEmailLog(log?.id, { status: "SENT", transport: "resend" });
      return { transport: "resend", messageId: info.messageId, redirectedToTest };
    }

    // Fallback console local uniquement — jamais présenté comme envoyé
    if (/localhost|127\.0\.0\.1/i.test(cfg.publicUrl)) {
      console.warn(
        `[All Vap's] Email: aucun provider SMTP/Resend — aperçu console uniquement (to=${maskEmail(intendedTo)}). Non livré.`
      );
      await sendViaConsole(mail);
      await markEmailLog(log?.id, {
        status: "SKIPPED",
        transport: "console",
        lastErrorCode: "CONSOLE_ONLY_NOT_DELIVERED",
      });
      return { transport: "console", redirectedToTest };
    }

    throw new EmailError("Configuration e-mail incomplète", "EMAIL_NOT_CONFIGURED");
  } catch (err) {
    const code =
      err instanceof EmailError ? err.code : "SEND_FAILED";
    await markEmailLog(log?.id, {
      status: "FAILED",
      lastErrorCode: code,
    });
    // Ne jamais logger le secret ni le corps d'erreur brut contenant des credentials
    console.error(`[All Vap's] Échec envoi e-mail (${code}) to=${maskEmail(intendedTo)}`);
    throw err instanceof EmailError
      ? err
      : new EmailError("Échec d'envoi e-mail", "SEND_FAILED");
  }
}

export { isEmailConfigured } from "./compat";
