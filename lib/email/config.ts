/**
 * Configuration e-mail centralisée (A.V.A. / Gmail).
 * Ne jamais logger SMTP_APP_PASSWORD / SMTP_PASS.
 */

import {
  avaFromDisplayName,
  isForbiddenAutomaticFrom,
  resolveAvaFromAddress,
} from "@/lib/email/ava-identity";

export type EmailConfig = {
  enabled: boolean;
  configured: boolean;
  testMode: boolean;
  testRecipient: string | null;
  fromName: string;
  fromAddress: string;
  replyTo: string;
  adminNotificationEmail: string | null;
  publicUrl: string;
  loyaltyEmailsEnabled: boolean;
  smtp: {
    host: string | null;
    port: number;
    secure: boolean;
    user: string | null;
    /** Présence uniquement — jamais la valeur */
    hasPassword: boolean;
  };
  resendConfigured: boolean;
  transportPreference: "auto" | "smtp" | "resend" | "console";
};

function truthy(v: string | undefined, defaultValue = false): boolean {
  if (v == null || v === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function smtpPasswordPresent(): boolean {
  return !!(process.env.SMTP_APP_PASSWORD || process.env.SMTP_PASS);
}

/** Mot de passe SMTP — usage interne transport uniquement, jamais loggé. */
export function getSmtpPassword(): string | null {
  // Gmail affiche souvent « xxxx xxxx xxxx xxxx » : retirer les espaces internes.
  const p = (process.env.SMTP_APP_PASSWORD || process.env.SMTP_PASS || "")
    .trim()
    .replace(/\s+/g, "");
  return p || null;
}

export function getEmailConfig(): EmailConfig {
  const fromAddress = resolveAvaFromAddress();
  const fromName = avaFromDisplayName();
  const publicUrl = (
    process.env.APP_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");

  const host = process.env.SMTP_HOST || null;
  const user = process.env.SMTP_USER || process.env.MAIL_FROM_ADDRESS || fromAddress;
  const hasPassword = smtpPasswordPresent();
  const smtpReady = !!(host && user && hasPassword);
  const resendConfigured = !!process.env.RESEND_API_KEY;
  const preferred = (process.env.EMAIL_TRANSPORT || "auto") as EmailConfig["transportPreference"];
  const enabled = truthy(process.env.MAIL_ENABLED, true);

  // « configured » = capable de livrer réellement (SMTP ou Resend).
  // Console locale ≠ configuré pour la livraison.
  const configured = smtpReady || resendConfigured;

  const replyRaw = (process.env.MAIL_REPLY_TO || fromAddress).trim();
  const replyTo = isForbiddenAutomaticFrom(replyRaw) ? fromAddress : replyRaw;

  return {
    enabled,
    configured,
    testMode: truthy(process.env.MAIL_TEST_MODE, false),
    testRecipient: (process.env.MAIL_TEST_RECIPIENT || "").trim() || null,
    fromName,
    fromAddress,
    replyTo,
    adminNotificationEmail:
      (process.env.ADMIN_NOTIFICATION_EMAIL || process.env.ADMIN_NOTIFY_EMAIL || "").trim() ||
      null,
    publicUrl,
    loyaltyEmailsEnabled: truthy(process.env.LOYALTY_EMAILS_ENABLED, false),
    smtp: {
      host,
      port: Number(process.env.SMTP_PORT || "465"),
      secure: truthy(process.env.SMTP_SECURE, Number(process.env.SMTP_PORT || "465") === 465),
      user,
      hasPassword,
    },
    resendConfigured,
    transportPreference: ["auto", "smtp", "resend", "console"].includes(preferred)
      ? preferred
      : "auto",
  };
}

export function formatFromHeader(config = getEmailConfig()): string {
  // Évite injection : pas de \r\n dans le nom
  const name = config.fromName.replace(/[\r\n]/g, "").trim();
  const addr = config.fromAddress.replace(/[\r\n]/g, "").trim();
  return `${name} <${addr}>`;
}

export function logEmailStartupStatus(): void {
  const cfg = getEmailConfig();
  if (!cfg.enabled) {
    console.log("[All Vap's] Service e-mail désactivé (MAIL_ENABLED=false).");
    return;
  }
  if (!cfg.configured && !cfg.smtp.hasPassword && !cfg.resendConfigured) {
    console.log("[All Vap's] Service e-mail désactivé : configuration incomplète.");
    return;
  }
  if (cfg.smtp.hasPassword && cfg.smtp.host) {
    console.log("[All Vap's] Service e-mail configuré.");
    if (cfg.testMode) {
      console.log("[All Vap's] Mode e-mail TEST actif.");
    }
    return;
  }
  if (cfg.resendConfigured) {
    console.log("[All Vap's] Service e-mail configuré.");
    return;
  }
  console.log("[All Vap's] Service e-mail : fallback local (console) disponible.");
}
