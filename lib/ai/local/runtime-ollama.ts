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

export function getOllamaRuntimeUrl(): string {
  return (
    envTrim("AVA_OLLAMA_BASE_URL") ||
    envTrim("OLLAMA_HOST") ||
    "http://127.0.0.1:11434"
  ).replace(/\/$/, "");
}

/** Runtime Ollama — un adaptateur parmi d'autres. */
export class OllamaLocalRuntime implements LocalAIRuntime {
  readonly id: LocalRuntimeId = "ollama";

  constructor(private readonly baseUrl = getOllamaRuntimeUrl()) {}

  async isReachable(): Promise<boolean> {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2500);
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: ctrl.signal });
      clearTimeout(t);
      return res.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<LocalModelInfo[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      if (!res.ok) return [];
      const data = (await res.json()) as {
        models?: Array<{ name?: string; size?: number; details?: { family?: string } }>;
      };
      return (data.models || [])
        .filter((m) => m.name)
        .map((m) => ({
          name: m.name!,
          sizeBytes: m.size,
          family: m.details?.family || null,
        }));
    } catch {
      return [];
    }
  }

  /**
   * Un seul modèle chargé : décharge les autres via keep_alive=0.
   * Activé par défaut (désactiver avec OLLAMA_SINGLE_MODEL=0).
   */
  private async unloadOtherModels(keepModel: string): Promise<void> {
    if (envTrim("OLLAMA_SINGLE_MODEL", "1") === "0") return;
    try {
      const res = await fetch(`${this.baseUrl}/api/ps`);
      if (!res.ok) return;
      const j = (await res.json()) as { models?: Array<{ name?: string }> };
      const loaded = (j.models || []).map((m) => m.name || "").filter(Boolean);
      for (const name of loaded) {
        if (name === keepModel) continue;
        // keep_alive=0 force le unload immédiat de ce modèle
        await fetch(`${this.baseUrl}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: name, keep_alive: 0, prompt: "" }),
        }).catch(() => null);
      }
    } catch {
      /* best-effort */
    }
  }

  async chat(req: LocalChatRequest): Promise<LocalChatResponse> {
    const started = Date.now();
    try {
      await this.unloadOtherModels(req.model);
      const ctrl = new AbortController();
      const timeout = req.timeoutMs ?? (Number(envTrim("AVA_OLLAMA_TIMEOUT_MS", "120000")) || 120000);
      const t = setTimeout(() => ctrl.abort(), timeout);
      const body: Record<string, unknown> = {
        model: req.model,
        messages: req.messages,
        stream: false,
        // Un seul gros modèle en RAM : libère rapidement après idle
        keep_alive: envTrim("OLLAMA_KEEP_ALIVE", "2m") || "2m",
        options: {
          temperature: req.temperature ?? 0.5,
          num_predict: req.maxTokens ?? 512,
        },
      };
      if (req.jsonMode) {
        body.format = "json";
      }
      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify(body),
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
        message?: { content?: string };
        eval_count?: number;
        eval_duration?: number;
      };
      const text = data.message?.content?.trim() || null;
      const tokensApprox =
        typeof data.eval_count === "number" ? data.eval_count : text ? Math.ceil(text.length / 4) : null;
      return {
        ok: Boolean(text),
        text,
        model: req.model,
        runtime: this.id,
        latencyMs,
        tokensApprox,
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
