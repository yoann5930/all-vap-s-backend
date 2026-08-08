/**
 * Codes d'erreur structurés A.V.A. — jamais de secrets dans message/logs.
 */
export const AvaErrorCode = {
  AVA_MODEL_UNAVAILABLE: "AVA_MODEL_UNAVAILABLE",
  AVA_MEMORY_UNAVAILABLE: "AVA_MEMORY_UNAVAILABLE",
  AVA_TIMEOUT: "AVA_TIMEOUT",
  AVA_AUTH_FAILED: "AVA_AUTH_FAILED",
  AVA_INVALID_RESPONSE: "AVA_INVALID_RESPONSE",
  AVA_TOOL_ERROR: "AVA_TOOL_ERROR",
  AVA_INTERNAL_ERROR: "AVA_INTERNAL_ERROR",
  AVA_PERMISSION_DENIED: "AVA_PERMISSION_DENIED",
  AVA_IDENTITY_UNVERIFIED: "AVA_IDENTITY_UNVERIFIED",
} as const;

export type AvaErrorCode = (typeof AvaErrorCode)[keyof typeof AvaErrorCode];

export class AvaError extends Error {
  code: AvaErrorCode;
  publicMessage: string;
  constructor(code: AvaErrorCode, technical: string, publicMessage?: string) {
    super(technical);
    this.name = "AvaError";
    this.code = code;
    this.publicMessage =
      publicMessage ||
      "A.V.A. rencontre un souci technique. Tu peux réessayer — la conversation continue.";
  }
}

export function toPublicAvaError(error: unknown): {
  code: AvaErrorCode;
  publicMessage: string;
  technical: string;
} {
  if (error instanceof AvaError) {
    return {
      code: error.code,
      publicMessage: error.publicMessage,
      technical: error.message.slice(0, 400),
    };
  }
  const msg = error instanceof Error ? error.message : String(error);
  if (/timeout|AbortError|ETIMEDOUT/i.test(msg)) {
    return {
      code: AvaErrorCode.AVA_TIMEOUT,
      publicMessage: "A.V.A. a mis trop de temps à répondre. Réessaie.",
      technical: msg.slice(0, 400),
    };
  }
  if (/OPENAI|model|429|5\d\d/i.test(msg)) {
    return {
      code: AvaErrorCode.AVA_MODEL_UNAVAILABLE,
      publicMessage: "Le modèle est indisponible pour le moment. Réessaie dans un instant.",
      technical: msg.slice(0, 400),
    };
  }
  if (/UNAUTHORIZED|FORBIDDEN|auth/i.test(msg)) {
    return {
      code: AvaErrorCode.AVA_AUTH_FAILED,
      publicMessage: "Session invalide. Reconnecte-toi.",
      technical: msg.slice(0, 400),
    };
  }
  if (/prisma|database|P20|memory/i.test(msg)) {
    return {
      code: AvaErrorCode.AVA_MEMORY_UNAVAILABLE,
      publicMessage: "Mémoire temporairement indisponible. Réessaie.",
      technical: msg.slice(0, 400),
    };
  }
  return {
    code: AvaErrorCode.AVA_INTERNAL_ERROR,
    publicMessage:
      "A.V.A. rencontre un souci technique. Tu peux réessayer — la conversation continue.",
    technical: msg.slice(0, 400),
  };
}

/** Redacte secrets from any log string. */
export function redactAvaLog(input: string): string {
  return input
    .replace(/sk-[a-zA-Z0-9_-]+/g, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/password|secret|token|api[_-]?key/gi, "[redacted]");
}
