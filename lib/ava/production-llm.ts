/**
 * LLM production pour AVA GENERAL.
 * Vercel → gateway HMAC (llm.allvaps.fr) → Ollama local (Gemma / Llama).
 * Aucun fournisseur cloud. Aucune lecture de clé tierce.
 */
import { createHmac, randomBytes } from "node:crypto";

export type AvaProductionLlmRequest = {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  preferShort?: boolean;
  maxTokens?: number;
  logTag?: string;
};

export type AvaLlmErrorCategory =
  | "NOT_CONFIGURED"
  | "UNAVAILABLE"
  | "AUTH"
  | "MODEL_NOT_FOUND"
  | "TIMEOUT"
  | "NETWORK"
  | "PARSE_ERROR"
  | "EMPTY_RESPONSE"
  | "OTHER";

export type AvaProductionLlmResult = {
  ok: boolean;
  text: string | null;
  category?: AvaLlmErrorCategory;
  httpStatus?: number | null;
  model?: string | null;
};

function envTrim(name: string, fallback = ""): string {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.trim().replace(/^["']|["']$/g, "");
}

export function getAvaLocalGatewayUrl(): string {
  return (envTrim("AVA_LOCAL_AI_GATEWAY_URL") || envTrim("AVA_LLM_GATEWAY_URL")).replace(/\/$/, "");
}

function getGatewaySecret(): string {
  return envTrim("AVA_LLM_GATEWAY_SECRET");
}

function primaryModel(): string {
  return envTrim("AVA_LOCAL_MODEL", "gemma3:12b") || "gemma3:12b";
}

function fallbackModel(): string {
  return envTrim("AVA_LOCAL_FALLBACK", "llama3.2:3b") || "llama3.2:3b";
}

export function classifyLocalFailure(error: string | null | undefined): AvaLlmErrorCategory {
  const raw = (error || "").toLowerCase();
  if (!raw) return "OTHER";
  if (raw.includes("not_configured") || raw.includes("gateway_not_configured")) return "NOT_CONFIGURED";
  if (raw.includes("circuit") || raw.includes("unavailable") || raw.includes("aucun runtime")) {
    return "UNAVAILABLE";
  }
  if (raw.includes("http_401") || raw.includes("http_403")) return "AUTH";
  if (raw.includes("http_404") || raw.includes("model_not_found")) return "MODEL_NOT_FOUND";
  if (raw.includes("timeout") || raw.includes("abort")) return "TIMEOUT";
  if (raw.includes("empty") || raw.includes("not_ok") || raw.includes("parse")) return "EMPTY_RESPONSE";
  if (raw.includes("http_") || raw.includes("network") || raw.includes("fetch") || raw.includes("econn")) {
    return "NETWORK";
  }
  return "OTHER";
}

export function spokenLocalLlmFailure(category?: AvaLlmErrorCategory): string {
  if (category === "NOT_CONFIGURED") {
    return "Mon moteur local n'est pas encore configuré. Ce n'est pas une interdiction de répondre.";
  }
  if (category === "MODEL_NOT_FOUND") {
    return "Le modèle local n'est pas disponible pour le moment.";
  }
  return "Je n'arrive pas à joindre mon moteur local pour le moment. Ce n'est pas une interdiction.";
}

function logSafe(line: string) {
  console.info(line.replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]").replace(/Bearer\s+\S+/gi, "Bearer [redacted]"));
}

function signPayload(secret: string, body: string, timestamp: string, nonce: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${nonce}.${body}`).digest("hex");
}

async function gatewayChat(params: {
  baseUrl: string;
  secret: string;
  model: string;
  messages: AvaProductionLlmRequest["messages"];
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
}): Promise<{ ok: boolean; text: string | null; status: number | null; error: string; latencyMs: number }> {
  const body = JSON.stringify({
    model: params.model,
    messages: params.messages,
    maxTokens: params.maxTokens,
    temperature: params.temperature,
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString("hex");
  const signature = signPayload(params.secret, body, timestamp, nonce);
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), params.timeoutMs);
  try {
    const res = await fetch(`${params.baseUrl}/v1/ava/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Allvaps-Timestamp": timestamp,
        "X-Allvaps-Nonce": nonce,
        "X-Allvaps-Signature": signature,
      },
      body,
      signal: ctrl.signal,
    });
    const latencyMs = Date.now() - started;
    const raw = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        text: null,
        status: res.status,
        error: `http_${res.status}`,
        latencyMs,
      };
    }
    let data: { ok?: boolean; text?: string };
    try {
      data = JSON.parse(raw) as { ok?: boolean; text?: string };
    } catch {
      return { ok: false, text: null, status: res.status, error: "parse", latencyMs };
    }
    const text = data.text?.trim() || null;
    if (!data.ok || !text) {
      return { ok: false, text: null, status: res.status, error: "empty_or_not_ok", latencyMs };
    }
    return { ok: true, text, status: res.status, error: "", latencyMs };
  } catch (error) {
    const timeout = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      text: null,
      status: null,
      error: timeout ? "timeout" : "network",
      latencyMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function chatWithAvaLlm(
  req: AvaProductionLlmRequest,
): Promise<AvaProductionLlmResult> {
  const tag = req.logTag || "ava-brain-llm";
  const baseUrl = getAvaLocalGatewayUrl();
  const secret = getGatewaySecret();
  const timeoutMs = Number(envTrim("AVA_LLM_TIMEOUT_MS", "60000")) || 60000;
  const maxTokens = req.maxTokens ?? (req.preferShort ? 180 : 320);
  const temperature = req.preferShort ? 0.45 : 0.55;
  const models = [primaryModel(), fallbackModel()].filter((m, i, arr) => arr.indexOf(m) === i);

  logSafe("AVA_LLM_REQUEST_START");
  logSafe("AVA_LLM_PROVIDER local");
  logSafe(`AVA_LLM_ENDPOINT ${baseUrl || "unset"}`);

  if (!baseUrl || secret.length < 32) {
    console.warn("AVA_LLM_LOCAL_UNAVAILABLE not_configured");
    console.warn("AVA_TOOL_ERROR tool=llm provider=local category=NOT_CONFIGURED");
    return { ok: false, text: null, category: "NOT_CONFIGURED", httpStatus: null, model: null };
  }

  let last: AvaProductionLlmResult = {
    ok: false,
    text: null,
    category: "UNAVAILABLE",
    httpStatus: null,
    model: models[0],
  };

  for (const model of models) {
    logSafe(`AVA_LLM_MODEL ${model}`);
    const result = await gatewayChat({
      baseUrl,
      secret,
      model,
      messages: req.messages,
      maxTokens,
      temperature,
      timeoutMs,
    });
    logSafe(`AVA_LLM_HTTP_STATUS ${result.status ?? "none"}`);
    logSafe(`AVA_LLM_DURATION ${result.latencyMs}`);
    if (result.ok && result.text) {
      logSafe(`[${tag}] provider=local model=${model} latencyMs=${result.latencyMs}`);
      return { ok: true, text: result.text, httpStatus: result.status, model };
    }
    const category = classifyLocalFailure(result.error);
    if (category === "AUTH") console.warn("AVA_LLM_AUTH_ERROR");
    if (category === "TIMEOUT") console.warn("AVA_LLM_TIMEOUT");
    console.warn(
      `AVA_TOOL_ERROR tool=llm provider=local category=${category} model=${model}`,
    );
    last = {
      ok: false,
      text: null,
      category,
      httpStatus: result.status,
      model,
    };
    if (category === "AUTH" || category === "TIMEOUT" || category === "NOT_CONFIGURED") {
      return last;
    }
  }

  return last;
}
