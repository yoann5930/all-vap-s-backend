import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function envTrim(name: string, fallback = ""): string {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.trim().replace(/^["']|["']$/g, "");
}

/** Charge .local/ava-llm-gateway/gateway.env si présent (clés absentes seulement). */
export function loadGatewayEnvFile(): void {
  const candidates = [
    resolve(process.cwd(), "../../.local/ava-llm-gateway/gateway.env"),
    resolve(process.cwd(), ".local/ava-llm-gateway/gateway.env"),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      for (const line of lines) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const i = t.indexOf("=");
        if (i <= 0) continue;
        const k = t.slice(0, i).trim();
        let v = t.slice(i + 1).trim();
        if (
          (v.startsWith('"') && v.endsWith('"')) ||
          (v.startsWith("'") && v.endsWith("'"))
        ) {
          v = v.slice(1, -1);
        }
        if (!(k in process.env) || !process.env[k]) process.env[k] = v;
      }
      return;
    } catch {
      /* ignore */
    }
  }
}

function loadSecretFromFile(): string {
  const file =
    envTrim("AVA_LLM_GATEWAY_SECRET_FILE") ||
    resolve(process.cwd(), "../../.local/ava-llm-gateway/gateway.secret");
  try {
    if (existsSync(file)) {
      return readFileSync(file, "utf8").trim();
    }
  } catch {
    /* ignore */
  }
  const alt = resolve(process.cwd(), ".local/ava-llm-gateway/gateway.secret");
  try {
    if (existsSync(alt)) return readFileSync(alt, "utf8").trim();
  } catch {
    /* ignore */
  }
  return "";
}

export type GatewayConfig = {
  host: string;
  port: number;
  secret: string;
  ollamaBaseUrl: string;
  allowedModels: string[];
  primaryModel: string;
  fallbackModel: string;
  maxBodyBytes: number;
  maxSkewSec: number;
  rateLimitPerMin: number;
  ollamaTimeoutMs: number;
};

export function loadConfig(): GatewayConfig {
  loadGatewayEnvFile();
  const secret = envTrim("AVA_LLM_GATEWAY_SECRET") || loadSecretFromFile();
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
        "qwen2.5:3b",
        "phi3:mini",
        "llama3.1:8b",
        "gemma3:12b",
        "mistral-small",
      ];

  return {
    host: envTrim("AVA_LLM_GATEWAY_HOST", "127.0.0.1") || "127.0.0.1",
    port: Number(envTrim("AVA_LLM_GATEWAY_PORT", "8791")) || 8791,
    secret,
    ollamaBaseUrl: (
      envTrim("OLLAMA_HOST") ||
      envTrim("AVA_OLLAMA_BASE_URL") ||
      "http://127.0.0.1:11434"
    ).replace(/\/$/, ""),
    allowedModels: [...new Set(allowed)],
    primaryModel: primary,
    fallbackModel: fallback,
    maxBodyBytes: Number(envTrim("AVA_LLM_GATEWAY_MAX_BODY", "120000")) || 120000,
    maxSkewSec: Number(envTrim("AVA_LLM_GATEWAY_MAX_SKEW_SEC", "120")) || 120,
    rateLimitPerMin: Number(envTrim("AVA_LLM_GATEWAY_RATE_PER_MIN", "30")) || 30,
    ollamaTimeoutMs: Number(envTrim("AVA_OLLAMA_TIMEOUT_MS", "120000")) || 120000,
  };
}
