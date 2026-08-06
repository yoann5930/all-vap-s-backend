import nodemailer, { type Transporter } from "nodemailer";
import { formatFromHeader, getEmailConfig, getSmtpPassword } from "./config";
import { EmailError } from "./errors";
import type { EmailPayload } from "./types";

let cachedTransporter: Transporter | null = null;
let cachedKey: string | null = null;

function transportCacheKey(): string {
  const cfg = getEmailConfig();
  // Pas le mot de passe — seulement présence + host/user/port
  return `${cfg.smtp.host}|${cfg.smtp.port}|${cfg.smtp.user}|${cfg.smtp.hasPassword}|${cfg.smtp.secure}`;
}

export function getSmtpTransporter(): Transporter {
  const cfg = getEmailConfig();
  const pass = getSmtpPassword();
  if (!cfg.smtp.host || !cfg.smtp.user || !pass) {
    throw new EmailError("Configuration e-mail incomplète", "EMAIL_NOT_CONFIGURED");
  }

  const key = transportCacheKey();
  if (cachedTransporter && cachedKey === key) return cachedTransporter;

  cachedTransporter = nodemailer.createTransport({
    host: cfg.smtp.host,
    port: cfg.smtp.port,
    secure: cfg.smtp.secure,
    auth: {
      user: cfg.smtp.user,
      pass,
    },
  });
  cachedKey = key;
  return cachedTransporter;
}

export async function verifyEmailTransport(): Promise<{
  ok: boolean;
  mode: "smtp" | "resend" | "console" | "disabled" | "incomplete";
  message: string;
}> {
  const cfg = getEmailConfig();
  if (!cfg.enabled) {
    return { ok: false, mode: "disabled", message: "Service e-mail désactivé." };
  }

  if (cfg.transportPreference === "console") {
    return { ok: true, mode: "console", message: "Transport console actif." };
  }

  if (
    cfg.transportPreference === "smtp" ||
    (cfg.transportPreference === "auto" && cfg.smtp.hasPassword && cfg.smtp.host)
  ) {
    try {
      const t = getSmtpTransporter();
      await t.verify();
      return { ok: true, mode: "smtp", message: "Service e-mail configuré." };
    } catch {
      return {
        ok: false,
        mode: "smtp",
        message: "Connexion e-mail impossible. Vérifiez la configuration.",
      };
    }
  }

  if (cfg.resendConfigured) {
    return { ok: true, mode: "resend", message: "Service e-mail configuré." };
  }

  if (/localhost|127\.0\.0\.1/i.test(cfg.publicUrl)) {
    return {
      ok: true,
      mode: "console",
      message: "Fallback console local disponible.",
    };
  }

  return {
    ok: false,
    mode: "incomplete",
    message: "Service e-mail désactivé : configuration incomplète.",
  };
}

export async function sendViaSmtp(payload: EmailPayload): Promise<{ messageId?: string }> {
  const cfg = getEmailConfig();
  const transporter = getSmtpTransporter();
  const info = await transporter.sendMail({
    from: formatFromHeader(cfg),
    to: payload.to,
    bcc: payload.bcc?.length ? payload.bcc : undefined,
    replyTo: payload.replyTo || cfg.replyTo,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
    attachments: payload.attachments?.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.content),
      contentType: a.contentType || "application/pdf",
    })),
  });
  return { messageId: info.messageId };
}

export async function sendViaResend(payload: EmailPayload): Promise<{ messageId?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new EmailError("Configuration e-mail incomplète", "EMAIL_NOT_CONFIGURED");
  const cfg = getEmailConfig();

  const body: Record<string, unknown> = {
    from: formatFromHeader(cfg),
    to: [payload.to],
    reply_to: payload.replyTo || cfg.replyTo,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  };

  if (payload.bcc?.length) {
    body.bcc = payload.bcc;
  }

  if (payload.attachments?.length) {
    body.attachments = payload.attachments.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.content).toString("base64"),
    }));
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new EmailError("Échec d'envoi e-mail", "SEND_FAILED");
  }
  const json = (await response.json().catch(() => ({}))) as { id?: string };
  return { messageId: json.id };
}

export async function sendViaConsole(payload: EmailPayload): Promise<void> {
  const { maskEmail } = await import("./mask");
  console.log(
    `[All Vap's][email:console] to=${maskEmail(payload.to)} subject=${payload.subject} attachments=${payload.attachments?.length || 0}`
  );
}
