import type { GatewayConfig } from "./config.js";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function probeOllama(baseUrl: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`${baseUrl}/api/tags`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

export async function chatOllama(params: {
  cfg: GatewayConfig;
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
}): Promise<{ ok: boolean; text: string | null; error?: string; latencyMs: number }> {
  const started = Date.now();
  const { cfg, model, messages } = params;
  try {
    // Un seul modèle : décharge les autres avant chargement
    try {
      const ps = await fetch(`${cfg.ollamaBaseUrl}/api/ps`);
      if (ps.ok) {
        const j = (await ps.json()) as { models?: Array<{ name?: string }> };
        for (const m of j.models || []) {
          const name = m.name || "";
          if (!name || name === model) continue;
          await fetch(`${cfg.ollamaBaseUrl}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: name, keep_alive: 0, prompt: "" }),
          }).catch(() => null);
        }
      }
    } catch {
      /* ignore */
    }

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), cfg.ollamaTimeoutMs);
    const body: Record<string, unknown> = {
      model,
      messages,
      stream: false,
      // Un seul modèle à la fois : libère rapidement après la réponse
      keep_alive: process.env.OLLAMA_KEEP_ALIVE || "2m",
      options: {
        temperature: params.temperature ?? 0.5,
        num_predict: params.maxTokens ?? 512,
      },
    };
    if (params.jsonMode) body.format = "json";

    const res = await fetch(`${cfg.ollamaBaseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify(body),
    });
    clearTimeout(t);
    const raw = await res.text();
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return { ok: false, text: null, error: `ollama_http_${res.status}`, latencyMs };
    }
    const data = JSON.parse(raw) as { message?: { content?: string } };
    const text = data.message?.content?.trim() || null;
    return { ok: Boolean(text), text, latencyMs, error: text ? undefined : "empty" };
  } catch (e) {
    return {
      ok: false,
      text: null,
      error: e instanceof Error ? e.message.slice(0, 120) : "throw",
      latencyMs: Date.now() - started,
    };
  }
}

export function pickModel(
  cfg: GatewayConfig,
  requested: string | undefined,
  preferFallback: boolean
): string | null {
  const want = preferFallback
    ? cfg.fallbackModel
    : requested && requested.trim()
      ? requested.trim()
      : cfg.primaryModel;
  if (!cfg.allowedModels.includes(want)) return null;
  return want;
}
