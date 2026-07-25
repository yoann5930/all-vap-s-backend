import nodemailer from "nodemailer";

export type EmailPayload = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

function getFromAddress(): string {
  return process.env.EMAIL_FROM || "All Vap's <noreply@allvaps.fr>";
}

export function isEmailConfigured(): boolean {
  const transport = process.env.EMAIL_TRANSPORT || "auto";
  if (transport === "console") return true;
  if (process.env.RESEND_API_KEY) return true;
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) return true;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  if (/localhost|127\.0\.0\.1/i.test(appUrl)) return true;
  return process.env.NODE_ENV !== "production";
}

async function sendViaResend(payload: EmailPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("EMAIL_NOT_CONFIGURED");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getFromAddress(),
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Resend error: ${response.status} - ${err}`);
  }
}

async function sendViaSmtp(payload: EmailPayload): Promise<void> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) throw new Error("EMAIL_NOT_CONFIGURED");

  const port = Number(process.env.SMTP_PORT || "587");
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: getFromAddress(),
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  });
}

async function sendViaConsole(payload: EmailPayload): Promise<void> {
  console.log(
    `[All Vap's][email:console] to=${payload.to} subject=${payload.subject}\n${payload.text || payload.html}`
  );
}

/** Console autorisé si demandé explicitement, ou en local (localhost) sans provider externe. */
function allowConsoleFallback(): boolean {
  if ((process.env.EMAIL_TRANSPORT || "auto") === "console") return true;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  return /localhost|127\.0\.0\.1/i.test(appUrl);
}

/**
 * Envoie un email via Resend, SMTP, ou console (dev / local / EMAIL_TRANSPORT=console).
 */
export async function sendEmail(payload: EmailPayload): Promise<{ transport: string }> {
  const preferred = process.env.EMAIL_TRANSPORT || "auto";

  if (preferred === "console") {
    await sendViaConsole(payload);
    return { transport: "console" };
  }

  if (preferred === "resend" || (preferred === "auto" && process.env.RESEND_API_KEY)) {
    await sendViaResend(payload);
    return { transport: "resend" };
  }

  if (
    preferred === "smtp" ||
    (preferred === "auto" && process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
  ) {
    await sendViaSmtp(payload);
    return { transport: "smtp" };
  }

  if (allowConsoleFallback()) {
    console.warn("[All Vap's] Email: aucun provider configuré — fallback console (local uniquement).");
    await sendViaConsole(payload);
    return { transport: "console" };
  }

  throw new Error("EMAIL_NOT_CONFIGURED");
}

export async function sendPasswordResetEmail(params: {
  to: string;
  resetUrl: string;
}): Promise<void> {
  const subject = "Réinitialisation de votre mot de passe — All Vap's";
  const text = `Bonjour,\n\nPour réinitialiser votre mot de passe All Vap's, ouvrez ce lien (valable 1 heure) :\n${params.resetUrl}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet email.\n`;
  const html = `
    <p>Bonjour,</p>
    <p>Pour réinitialiser votre mot de passe All Vap's, cliquez sur le lien ci-dessous (valable 1 heure)&nbsp;:</p>
    <p><a href="${params.resetUrl}">${params.resetUrl}</a></p>
    <p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
  `;

  await sendEmail({ to: params.to, subject, html, text });
}

export async function sendAccountConfirmationEmail(params: {
  to: string;
  confirmUrl: string;
  firstName?: string | null;
}): Promise<void> {
  const hello = params.firstName ? `Bonjour ${params.firstName}` : "Bonjour";
  const subject = "Confirmez votre compte — All Vap's";
  const text = `${hello},\n\nBienvenue chez All Vap's ! Confirmez votre adresse email en ouvrant ce lien (valable 48 heures) :\n${params.confirmUrl}\n\nSi vous n'avez pas créé de compte, ignorez cet email.\n`;
  const html = `
    <p>${hello},</p>
    <p>Bienvenue chez All Vap's&nbsp;! Confirmez votre adresse email en cliquant sur le lien ci-dessous (valable 48 heures)&nbsp;:</p>
    <p><a href="${params.confirmUrl}">${params.confirmUrl}</a></p>
    <p>Si vous n'avez pas créé de compte, ignorez cet email.</p>
  `;
  await sendEmail({ to: params.to, subject, html, text });
}

export async function sendOrderShippedEmail(params: {
  to: string;
  orderId: string;
  customerName?: string | null;
  trackingNumber: string;
  trackingUrl?: string | null;
  deliveryMethod?: string | null;
}): Promise<void> {
  const ref = params.orderId.slice(-8).toUpperCase();
  const hello = params.customerName ? `Bonjour ${params.customerName}` : "Bonjour";
  const trackLine = params.trackingUrl
    ? `Suivi : ${params.trackingUrl}`
    : `N° de suivi : ${params.trackingNumber}`;
  const subject = `Votre commande #${ref} a été expédiée — All Vap's`;
  const text = `${hello},\n\nVotre commande #${ref} a été expédiée.\n${trackLine}\n\nMerci pour votre confiance.\nAll Vap's\n`;
  const html = `
    <p>${hello},</p>
    <p>Votre commande <strong>#${ref}</strong> a été expédiée.</p>
    <p>N° de suivi&nbsp;: <strong>${params.trackingNumber}</strong></p>
    ${params.trackingUrl ? `<p><a href="${params.trackingUrl}">Suivre mon colis</a></p>` : ""}
    <p>Merci pour votre confiance.<br/>All Vap's</p>
  `;
  await sendEmail({ to: params.to, subject, html, text });
}

export async function sendOrderDeliveredEmail(params: {
  to: string;
  orderId: string;
  customerName?: string | null;
}): Promise<void> {
  const ref = params.orderId.slice(-8).toUpperCase();
  const hello = params.customerName ? `Bonjour ${params.customerName}` : "Bonjour";
  const subject = `Votre commande #${ref} a été livrée — All Vap's`;
  const text = `${hello},\n\nVotre commande #${ref} a été marquée comme livrée. Nous espérons que tout vous convient.\n\nAll Vap's\n`;
  const html = `
    <p>${hello},</p>
    <p>Votre commande <strong>#${ref}</strong> a été marquée comme livrée.</p>
    <p>Nous espérons que tout vous convient.</p>
    <p>All Vap's</p>
  `;
  await sendEmail({ to: params.to, subject, html, text });
}

export async function sendOrderConfirmationEmail(params: {
  to: string;
  orderId: string;
  customerName?: string | null;
  totalCents: number;
  items: Array<{ name: string; quantity: number; priceCents: number }>;
}): Promise<void> {
  const ref = params.orderId.slice(-8).toUpperCase();
  const hello = params.customerName ? `Bonjour ${params.customerName}` : "Bonjour";
  const total = (params.totalCents / 100).toFixed(2).replace(".", ",");
  const lines = params.items
    .map((i) => `- ${i.name} × ${i.quantity} : ${((i.priceCents * i.quantity) / 100).toFixed(2)} €`)
    .join("\n");
  const htmlLines = params.items
    .map(
      (i) =>
        `<li>${i.name} × ${i.quantity} — <strong>${((i.priceCents * i.quantity) / 100).toFixed(2)} €</strong></li>`
    )
    .join("");
  const subject = `Confirmation de commande #${ref} — All Vap's`;
  const text = `${hello},\n\nMerci pour votre commande #${ref} !\n\n${lines}\n\nTotal : ${total} €\n\nAll Vap's\n`;
  const html = `
    <p>${hello},</p>
    <p>Merci pour votre commande <strong>#${ref}</strong> !</p>
    <ul>${htmlLines}</ul>
    <p>Total payé&nbsp;: <strong>${total} €</strong></p>
    <p>All Vap's</p>
  `;
  await sendEmail({ to: params.to, subject, html, text });
}

export async function sendAdminNewOrderEmail(params: {
  orderId: string;
  customerEmail: string;
  totalCents: number;
}): Promise<void> {
  const to = process.env.ADMIN_NOTIFY_EMAIL || process.env.EMAIL_FROM_NOTIFY || "";
  if (!to || !to.includes("@")) return;

  const ref = params.orderId.slice(-8).toUpperCase();
  const total = (params.totalCents / 100).toFixed(2).replace(".", ",");
  const subject = `[All Vap's] Nouvelle commande #${ref}`;
  const text = `Nouvelle commande payée #${ref}\nClient: ${params.customerEmail}\nTotal: ${total} €\n`;
  const html = `<p>Nouvelle commande payée <strong>#${ref}</strong></p><p>Client&nbsp;: ${params.customerEmail}</p><p>Total&nbsp;: <strong>${total} €</strong></p>`;
  await sendEmail({ to, subject, html, text });
}
