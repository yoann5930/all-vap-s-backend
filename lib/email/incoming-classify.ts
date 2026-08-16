/**
 * Classification des e-mails de la boîte AVA.
 * Un message envoyé par AVA ne doit jamais relancer un workflow métier.
 */
import { getAvaMailboxAddress, isAvaMailboxAddress } from "@/lib/email/ava-identity";

export type IncomingMailKind =
  | "customer"
  | "order"
  | "carrier"
  | "system"
  | "error"
  | "ava_outgoing"
  | "unknown";

export type IncomingMailMessage = {
  from?: string | null;
  to?: string | null;
  replyTo?: string | null;
  subject?: string | null;
  messageId?: string | null;
  threadId?: string | null;
  direction?: "inbound" | "outbound" | null;
  headers?: Record<string, string | null | undefined>;
};

export type IncomingMailDecision = {
  kind: IncomingMailKind;
  skipBusiness: boolean;
  reason: string;
};

function header(msg: IncomingMailMessage, name: string): string {
  const h = msg.headers || {};
  const key = Object.keys(h).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? String(h[key] || "").trim() : "";
}

function extractAddress(raw: string | null | undefined): string {
  const s = (raw || "").trim().toLowerCase();
  const m = s.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return (m?.[0] || s).toLowerCase();
}

const CARRIER_HINTS = [
  "mondial relay",
  "mondialrelay",
  "relais colis",
  "relaiscolis",
  "chronopost",
  "colissimo",
  "laposte",
];

const ERROR_HINTS = [
  "mailer-daemon",
  "mail delivery subsystem",
  "delivery status notification",
  "undeliverable",
  "undelivered",
  "failure notice",
  "delivery failure",
  "postmaster",
];

const ORDER_HINTS = [
  "nouvelle commande",
  "commande payee",
  "commande payée",
  "bon de commande",
  "paiement confirme",
  "paiement confirmé",
  "order confirmation",
  "paid order",
];

export function classifyIncomingMail(msg: IncomingMailMessage): IncomingMailDecision {
  const from = extractAddress(msg.from);
  const ava = getAvaMailboxAddress();
  const autoSubmitted = header(msg, "auto-submitted").toLowerCase();
  const xAuto = header(msg, "x-auto-response-suppress").toLowerCase();

  if (msg.direction === "outbound") {
    return { kind: "ava_outgoing", skipBusiness: true, reason: "direction_outbound" };
  }

  if (from && isAvaMailboxAddress(from)) {
    return { kind: "ava_outgoing", skipBusiness: true, reason: "from_ava_mailbox" };
  }

  if (from === ava) {
    return { kind: "ava_outgoing", skipBusiness: true, reason: "from_equals_ava_email" };
  }

  const replyTo = extractAddress(msg.replyTo);
  if (replyTo && isAvaMailboxAddress(replyTo) && (!from || isAvaMailboxAddress(from))) {
    return { kind: "ava_outgoing", skipBusiness: true, reason: "reply_to_ava" };
  }

  if (autoSubmitted && autoSubmitted !== "no") {
    return { kind: "system", skipBusiness: true, reason: "auto_submitted" };
  }
  if (xAuto) {
    return { kind: "system", skipBusiness: true, reason: "auto_response_header" };
  }

  const subject = (msg.subject || "").toLowerCase();
  const blob = `${from} ${subject}`;
  if (ERROR_HINTS.some((h) => blob.includes(h))) {
    return { kind: "error", skipBusiness: true, reason: "bounce_or_error" };
  }

  if (CARRIER_HINTS.some((h) => subject.includes(h) || from.includes(h.replace(/\s+/g, "")))) {
    return { kind: "carrier", skipBusiness: false, reason: "carrier_external" };
  }

  if (ORDER_HINTS.some((h) => subject.includes(h))) {
    return { kind: "order", skipBusiness: false, reason: "order_notification" };
  }

  if (from) {
    return { kind: "customer", skipBusiness: false, reason: "external_sender" };
  }

  return { kind: "unknown", skipBusiness: false, reason: "unclassified" };
}

/** True = ne pas traiter comme nouvelle instruction métier. */
export function shouldIgnoreIncomingAsBusiness(msg: IncomingMailMessage): boolean {
  return classifyIncomingMail(msg).skipBusiness;
}
