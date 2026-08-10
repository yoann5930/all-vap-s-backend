/**
 * Détection d'une consigne explicite de réponse simple
 * (« Réponds uniquement : … ») — hors outils métier.
 */

export function parseExplicitReplyInstruction(message: string): string | null {
  const raw = (message || "").trim();
  if (!raw) return null;

  const m = raw.match(
    /^(?:réponds|reponds|reply|dis|dit|écris|ecris)\s+(?:uniquement|exactement|seulement|juste)\s*[:：]\s*(.+)$/i
  );
  if (m?.[1]) {
    const token = m[1].trim().replace(/^["«]|["»]$/g, "").trim();
    return token ? token.slice(0, 200) : null;
  }

  const m2 = raw.match(/^reply\s+with\s+exactly\s*[:：]\s*(.+)$/i);
  if (m2?.[1]) {
    const token = m2[1].trim().replace(/^["«]|["»]$/g, "").trim();
    return token ? token.slice(0, 200) : null;
  }

  return null;
}

export function isExplicitReplyInstruction(message: string): boolean {
  return Boolean(parseExplicitReplyInstruction(message));
}
