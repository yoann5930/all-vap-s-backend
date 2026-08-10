import { createHmac, randomBytes } from "crypto";
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

export function getLocalAiGatewayUrl(): string {
  return (
    envTrim("AVA_LOCAL_AI_GATEWAY_URL") ||
    envTrim("AVA_LLM_GATEWAY_URL") ||
    ""
  ).replace(/\/$/, "");
}

export function getLocalAiGatewaySecret(): string {
  return envTrim("AVA_LLM_GATEWAY_SECRET");
}

function signPayload(secret: string, body: string, timestamp: string, nonce: string): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${nonce}.${body}`)
    .digest("hex");
}

/** Circuit breaker côté client Vercel. */
class ClientCircuit {
  private failures = 0;
  private openUntil = 0;
  constructor(
    private threshold = 4,
    private coolDownMs = 45_000
  ) {}
  get open() {
    return Date.now() < this.openUntil;
  }
  ok() {
    this.failures = 0;
    this.openUntil = 0;
  }
  fail() {
    this.failures += 1;
    if (this.failures >= this.threshold) {
      this.openUntil = Date.now() + this.coolDownMs;
      this.failures = 0;
    }
  }
}

const circuit = new ClientCircuit();

/**
 * Runtime distant : Vercel → HTTPS gateway → Ollama localhost.
 * Auth HMAC (même schéma que Fidelatoo).
 */
export class GatewayLocalRuntime implements LocalAIRuntime {
  readonly id: LocalRuntimeId = "openai_compatible";

  constructor(
    private readonly baseUrl = getLocalAiGatewayUrl(),
    private readonly secret = getLocalAiGatewaySecret()
  ) {}

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.secret.length >= 32);
  }

  async isReachable(): Promise<boolean> {
    if (!this.isConfigured() || circuit.open) return false;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(`${this.baseUrl}/health`, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) return false;
      const j = (await res.json()) as { ok?: boolean };
      return Boolean(j.ok);
    } catch {
      return false;
    }
  }

  async listModels(): Promise<LocalModelInfo[]> {
    const primary = envTrim("AVA_LOCAL_MODEL", "gemma3:12b") || "gemma3:12b";
    const fallback = envTrim("AVA_LOCAL_FALLBACK", "llama3.1:8b") || "llama3.1:8b";
    const allowRaw = envTrim("AVA_LLM_GATEWAY_ALLOWED_MODELS");
    const allowed = allowRaw
      ? allowRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : [
          primary,
          fallback,
          "llama3.2:3b",
          "qwen2.5:7b",
          "gemma3:12b",
          "llama3.1:8b",
        ];
    // Si /models HMAC disponible, on pourrait filtrer ; sinon liste configurée
    // (le chat fallback gère les modèles absents côté gateway Ollama).
    return [...new Set(allowed)].map((name) => ({ name, family: "gateway" }));
  }

  async chat(req: LocalChatRequest): Promise<LocalChatResponse> {
    const started = Date.now();
    if (!this.isConfigured()) {
      return {
        ok: false,
        text: null,
        model: req.model,
        runtime: this.id,
        latencyMs: 0,
        error: "gateway_not_configured",
      };
    }
    if (circuit.open) {
      return {
        ok: false,
        text: null,
        model: req.model,
        runtime: this.id,
        latencyMs: 0,
        error: "circuit_open",
      };
    }

    const body = JSON.stringify({
      model: req.model,
      messages: req.messages,
      maxTokens: req.maxTokens,
      temperature: req.temperature,
      jsonMode: req.jsonMode,
    });

    const maxAttempts = 2;
    let lastErr = "unknown";

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const nonce = randomBytes(16).toString("hex");
      const signature = signPayload(this.secret, body, timestamp, nonce);

      try {
        const ctrl = new AbortController();
        const timeout = req.timeoutMs ?? 120_000;
        const t = setTimeout(() => ctrl.abort(), timeout);
        const res = await fetch(`${this.baseUrl}/v1/ava/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Allvaps-Timestamp": timestamp,
            "X-Allvaps-Nonce": nonce,
            "X-Allvaps-Signature": signature,
          },
          signal: ctrl.signal,
          body,
        });
        clearTimeout(t);
        const raw = await res.text();
        const latencyMs = Date.now() - started;
        if (!res.ok) {
          lastErr = `http_${res.status}`;
          if (res.status === 503 || res.status >= 500) {
            circuit.fail();
            if (attempt < maxAttempts) {
              await new Promise((r) => setTimeout(r, 400 * attempt));
              continue;
            }
          }
          return {
            ok: false,
            text: null,
            model: req.model,
            runtime: this.id,
            latencyMs,
            error: lastErr,
          };
        }
        const data = JSON.parse(raw) as {
          ok?: boolean;
          text?: string;
          model?: string;
        };
        if (!data.ok || !data.text) {
          circuit.fail();
          return {
            ok: false,
            text: null,
            model: data.model || req.model,
            runtime: this.id,
            latencyMs,
            error: "empty_or_not_ok",
          };
        }
        circuit.ok();
        return {
          ok: true,
          text: data.text,
          model: data.model || req.model,
          runtime: this.id,
          latencyMs,
        };
      } catch (e) {
        lastErr = e instanceof Error ? e.message.slice(0, 120) : "throw";
        circuit.fail();
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 500 * attempt));
          continue;
        }
      }
    }

    return {
      ok: false,
      text: null,
      model: req.model,
      runtime: this.id,
      latencyMs: Date.now() - started,
      error: lastErr,
    };
  }
}
