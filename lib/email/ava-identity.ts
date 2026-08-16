/**
 * Identité e-mail d'AVA — unique source pour l'expéditeur automatique.
 * Ne jamais logger de mot de passe / token.
 */

const FORBIDDEN_AUTOMATIC_FROM = new Set([
  "yoann@allvaps.fr",
]);

function normalizeEmail(raw: string | null | undefined): string {
  return (raw || "").trim().toLowerCase();
}

function firstConfigured(values: Array<string | null | undefined>): string | null {
  for (const v of values) {
    const n = normalizeEmail(v);
    if (n && n.includes("@")) return n;
  }
  return null;
}

/** Boîte AVA déjà configurée (SMTP / MAIL_FROM / AVA_EMAIL). */
export function getAvaMailboxAddress(): string {
  const configured = firstConfigured([
    process.env.AVA_EMAIL,
    process.env.MAIL_FROM_ADDRESS,
    process.env.SMTP_USER,
    process.env.IMAP_USER,
    process.env.MAILBOX_ADDRESS,
  ].filter((v) => !isForbiddenAutomaticFrom(v)));
  if (configured) return configured;
  return "avaallvaps@gmail.com";
}

export function isAvaMailboxAddress(email: string | null | undefined): boolean {
  const n = normalizeEmail(email);
  return !!n && n === getAvaMailboxAddress();
}

export function isForbiddenAutomaticFrom(email: string | null | undefined): boolean {
  const n = normalizeEmail(email);
  if (!n) return false;
  if (FORBIDDEN_AUTOMATIC_FROM.has(n)) return true;
  if (n.startsWith("yoann@") && n.endsWith("allvaps.fr")) return true;
  return false;
}

/**
 * Adresse From pour les envois automatiques AVA.
 * Jamais l'adresse personnelle de Yoann.
 */
export function resolveAvaFromAddress(): string {
  const mailbox = getAvaMailboxAddress();
  if (isForbiddenAutomaticFrom(mailbox)) {
    throw new Error("AVA_SENDER_FORBIDDEN");
  }
  return mailbox;
}

export function isAvaSelfRecipient(to: string | null | undefined): boolean {
  return isAvaMailboxAddress(to);
}

export function avaFromDisplayName(): string {
  return (process.env.MAIL_FROM_NAME || "A.V.A. — All Vap's").replace(/[\r\n]/g, "").trim();
}
