/**
 * A.V.A. Admin — abstraction multi-provider LLM.
 * Personnalité / mémoire / outils restent hors de cette couche.
 */

export type AvaLlmProviderId = "local" | "openai" | "auto";

export type AvaLlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AvaLlmFailureKind =
  | "ok"
  | "missing_key"
  | "auth_rejected"
  | "insufficient_quota"
  | "rate_limit_exceeded"
  | "tokens_limit"
  | "model_not_found"
  | "invalid_request"
  | "provider_unavailable"
  | "openai_5xx"
  | "network_timeout"
  | "network_error"
  | "empty_content"
  | "parse_error"
  | "http_other"
  | "throw"
  | "disabled";

export type AvaLlmChatResult = {
  ok: boolean;
  text: string | null;
  provider: "local" | "openai" | "none";
  model: string | null;
  kind: AvaLlmFailureKind;
  httpStatus: number | null;
  apiCode: string | null;
  apiMessage: string | null;
  attempts: number;
  latencyMs: number;
  /** Providers tried in order (no infinite loop). */
  tried: Array<"local" | "openai">;
  failoverLogged?: boolean;
};

export type AvaLlmChatRequest = {
  messages: AvaLlmMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Prefer short replies (affects max tokens defaults). */
  preferShort?: boolean;
  logTag?: string;
};

export interface AvaLlmProvider {
  readonly id: "local" | "openai";
  isConfigured(): boolean;
  isReachable(): Promise<boolean>;
  chat(req: AvaLlmChatRequest): Promise<AvaLlmChatResult>;
}

export function envTrim(name: string, fallback = ""): string {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.trim().replace(/^["']|["']$/g, "");
}

export function resolveAvaLlmProviderMode(): AvaLlmProviderId {
  const raw = envTrim("AVA_LLM_PROVIDER", "auto").toLowerCase();
  if (raw === "local" || raw === "ollama") return "local";
  if (raw === "openai") return "openai";
  return "auto";
}

/** Strip secrets before any local/cloud LLM sees the prompt. */
export function scrubSecretsForLlm(text: string): string {
  return (text || "")
    .replace(/sk-[a-zA-Z0-9_-]{8,}/g, "[redacted_key]")
    .replace(/Bearer\s+[A-Za-z0-9._\-]{10,}/gi, "Bearer [redacted]")
    .replace(
      /(password|mot\s*de\s*passe|secret|api[_-]?key|token)\s*[:=]\s*\S+/gi,
      "$1=[redacted]"
    )
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "[redacted_jwt]");
}

export function scrubMessagesForLlm(messages: AvaLlmMessage[]): AvaLlmMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: scrubSecretsForLlm(m.content),
  }));
}
