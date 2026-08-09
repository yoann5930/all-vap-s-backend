import type {
  LocalAIRuntime,
  LocalChatRequest,
  LocalChatResponse,
  LocalModelInfo,
  LocalRuntimeId,
} from "./types";

function envTrim(name: string, fallback = ""): string {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.trim().replace(/^["']|["']$/g, "");
}

/**
 * Runtime llama.cpp / serveur OpenAI-compatible (ex. llama-server --port 8080).
 * Non branché par défaut — prêt pour le PC fixe sans réécrire A.V.A.
 */
export class LlamaCppLocalRuntime implements LocalAIRuntime {
  readonly id: LocalRuntimeId = "llamacpp";

  constructor(
    private readonly baseUrl = (
      envTrim("AVA_LLAMACPP_BASE_URL") ||
      envTrim("LLAMACPP_HOST") ||
      ""
    ).replace(/\/$/, ""),
    private readonly defaultModel = envTrim("AVA_LLAMACPP_MODEL", "local")
  ) {}

  isConfigured(): boolean {
    return Boolean(this.baseUrl);
  }

  async isReachable(): Promise<boolean> {
    if (!this.baseUrl) return false;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2500);
      const res = await fetch(`${this.baseUrl}/v1/models`, { signal: ctrl.signal });
      clearTimeout(t);
      return res.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<LocalModelInfo[]> {
    if (!this.baseUrl) return [];
    try {
      const res = await fetch(`${this.baseUrl}/v1/models`);
      if (!res.ok) return [];
      const data = (await res.json()) as { data?: Array<{ id?: string }> };
      return (data.data || [])
        .filter((m) => m.id)
        .map((m) => ({ name: m.id!, family: "llamacpp" }));
    } catch {
      return [];
    }
  }

  async chat(req: LocalChatRequest): Promise<LocalChatResponse> {
    const started = Date.now();
    if (!this.baseUrl) {
      return {
        ok: false,
        text: null,
        model: req.model,
        runtime: this.id,
        latencyMs: 0,
        error: "AVA_LLAMACPP_BASE_URL non configuré",
      };
    }
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), req.timeoutMs ?? 120000);
      const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          model: req.model || this.defaultModel,
          messages: req.messages,
          max_tokens: req.maxTokens ?? 512,
          temperature: req.temperature ?? 0.5,
          response_format: req.jsonMode ? { type: "json_object" } : undefined,
        }),
      });
      clearTimeout(t);
      const raw = await res.text();
      const latencyMs = Date.now() - started;
      if (!res.ok) {
        return {
          ok: false,
          text: null,
          model: req.model,
          runtime: this.id,
          latencyMs,
          error: raw.slice(0, 200),
        };
      }
      const data = JSON.parse(raw) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content?.trim() || null;
      return {
        ok: Boolean(text),
        text,
        model: req.model,
        runtime: this.id,
        latencyMs,
        error: text ? null : "empty_content",
      };
    } catch (e) {
      return {
        ok: false,
        text: null,
        model: req.model,
        runtime: this.id,
        latencyMs: Date.now() - started,
        error: e instanceof Error ? e.message.slice(0, 160) : String(e),
      };
    }
  }
}
