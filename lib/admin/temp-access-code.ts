import { randomBytes } from "node:crypto";

/**
 * Génère un code d’accès temporaire sécurisé (14 caractères).
 * À hasher immédiatement avec bcrypt — ne jamais journaliser ni stocker en clair.
 */
export function generateTempAccessCode(length = 14): string {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$";
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}
