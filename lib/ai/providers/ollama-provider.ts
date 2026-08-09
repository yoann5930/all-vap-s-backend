import type {
  AvaLlmChatRequest,
  AvaLlmChatResult,
  AvaLlmProvider,
} from "./types";
import { envTrim, scrubMessagesForLlm } from "./types";

/** Modèle léger FR-capable déjà courant chez Ollama (quantifié ~4–5 Go). */
export const DEFAULT_OLLAMA_MODEL = "qwen2.5:7b";

export function getOllamaBaseUrl(): string {
  return (
    envTrim("AVA_OLLAMA_BASE_URL") ||
    envTrim("OLLAMA_HOST") ||
    "http://127.0.0.1:11434"
  ).replace(/\/$/, "");
}

export function getOllamaModel(): string {
  return (
    envTrim("AVA_OLLAMA_MODEL") ||
    envTrim("OLLAMA_MODEL") ||
    DEFAULT_OLLAMA_MODEL
  );
}

export class OllamaAvaProvider implements AvaLlmProvider {
  readonly id = "local" as const;

  isConfigured(): boolean {
    const base = getOllamaBaseUrl();
    // Toujours « configuré » si URL définie ; reachability séparée
    return Boolean(base);
  }

  async isReachable(): Promise<boolean> {
    const base = getOllamaBaseUrl();
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2500);
      const res = await fetch(`${base}/api/tags`, {
        method: "GET",
        signal: ctrl.signal,
      });
      clearTimeout(t);
      return res.ok;
    } catch {
      return false;
    }
  }

  async chat(req: AvaLlmChatRequest): Promise<AvaLlmChatResult> {
    const base = getOllamaBaseUrl();
    const model = getOllamaModel();
    const started = Date.now();
    const messages = scrubMessagesForLlm(req.messages);

    try {
      const ctrl = new AbortController();
      const timeoutMs = Number(envTrim("AVA_OLLAMA_TIMEOUT_MS", "90000")) || 90000;
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          options: {
            temperature: req.temperature ?? (req.preferShort ? 0.45 : 0.55),
            num_predict: req.maxTokens ?? (req.preferShort ? 320 : 900),
          },
        }),
      });
      clearTimeout(t);
      const latencyMs = Date.now() - started;
      const raw = await res.text();

      if (!res.ok) {
        let apiMessage: string | null = null;
        try {
          const j = JSON.parse(raw) as { error?: string };
          apiMessage = (j.error || raw).slice(0, 200);
        } catch {
          apiMessage = raw.slice(0, 200);
        }
        const kind =
          res.status === 404
            ? "model_not_found"
            : res.status >= 500
              ? "openai_5xx"
              : "http_other";
        console.warn(
          `[ava-llm-local] http=${res.status} model=${model} msg=${apiMessage || "-"}`
        );
        return {
          ok: false,
          text: null,
          provider: "local",
          model,
          kind: kind as AvaLlmChatResult["kind"],
          httpStatus: res.status,
          apiCode: null,
          apiMessage,
          attempts: 1,
          latencyMs,
          tried: ["local"],
        };
      }

      let text: string | null = null;
      try {
        const data = JSON.parse(raw) as {
          message?: { content?: string };
          response?: string;
        };
        text =
          data.message?.content?.trim() ||
          data.response?.trim() ||
          null;
      } catch {
        return {
          ok: false,
          text: null,
          provider: "local",
          model,
          kind: "parse_error",
          httpStatus: res.status,
          apiCode: null,
          apiMessage: null,
          attempts: 1,
          latencyMs,
          tried: ["local"],
        };
      }

      return {
        ok: Boolean(text),
        text,
        provider: "local",
        model,
        kind: text ? "ok" : "empty_content",
        httpStatus: res.status,
        apiCode: null,
        apiMessage: null,
        attempts: 1,
        latencyMs,
        tried: ["local"],
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const kind = /abort|timeout/i.test(msg)
        ? "network_timeout"
        : /fetch|ECONN|ENOTFOUND|network/i.test(msg)
          ? "network_error"
          : "throw";
      console.warn(`[ava-llm-local] throw kind=${kind}`);
      return {
        ok: false,
        text: null,
        provider: "local",
        model,
        kind,
        httpStatus: null,
        apiCode: null,
        apiMessage: msg.slice(0, 160),
        attempts: 1,
        latencyMs: Date.now() - started,
        tried: ["local"],
      };
    }
  }
}
