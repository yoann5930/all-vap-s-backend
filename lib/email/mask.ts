/** Masquage PII pour logs / EmailLog — jamais de données complètes. */

export function maskEmail(email: string): string {
  const raw = (email || "").trim().toLowerCase();
  const at = raw.indexOf("@");
  if (at < 1) return "***";
  const local = raw.slice(0, at);
  const domain = raw.slice(at + 1);
  const visible = local.slice(0, 1);
  return `${visible}***@${domain}`;
}

export function maskPhone(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length < 4) return "** ** ** **";
  const last2 = digits.slice(-2);
  return `** ** ** ** ${last2}`;
}
