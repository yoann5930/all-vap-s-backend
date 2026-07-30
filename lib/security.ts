import { createHash, randomBytes } from "crypto";

export {
  getAllowedOrigins,
  isAllowedOrigin,
  assertSameOrigin,
} from "@/lib/security-origins";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateSecureToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

/** Sanitize basique anti-XSS pour chaînes affichées hors React escape. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
