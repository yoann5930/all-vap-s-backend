/**
 * A.V.A. LLM Gateway — bind 127.0.0.1 only.
 * Public TLS via Caddy reverse_proxy. Never expose Ollama :11434.
 */
import http from "node:http";
import { freemem } from "node:os";
import { loadConfig } from "./config.js";
import { assertRequestAuth, fingerprintSecret } from "./auth.js";
import { CircuitBreaker, SlidingWindowRateLimit } from "./limits.js";
import { chatOllama, pickModel, probeOllama, type ChatMessage } from "./ollama.js";

const cfg = loadConfig();
const rate = new SlidingWindowRateLimit(cfg.rateLimitPerMin);
const breaker = new CircuitBreaker(5, 30_000);

function json(res: http.ServerResponse, status: number, body: unknown) {
  const raw = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(raw);
}

function readBody(req: http.IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new Error("body_too_large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function clientKey(req: http.IncomingMessage): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "local"
  );
}

async function handleHealth(
  _req: http.IncomingMessage,
  res: http.ServerResponse
) {
  // Public / minimal — pas de noms de modèles, pas d'empreinte secret, pas d'host
  const ollamaOk = await probeOllama(cfg.ollamaBaseUrl);
  const secretOk = cfg.secret.length >= 32;
  const ok = ollamaOk && !breaker.open && secretOk;
  json(res, ok ? 200 : 503, {
    ok,
    service: "ava-llm-gateway",
    ollama: ollamaOk ? "up" : "down",
    circuit: breaker.open ? "open" : "closed",
  });
}

async function requireHmac(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  bodyRaw = ""
): Promise<boolean> {
  if (!cfg.secret || cfg.secret.length < 32) {
    json(res, 503, { ok: false, error: "gateway_secret_missing" });
    return false;
  }
  const auth = assertRequestAuth({
    secret: cfg.secret,
    body: bodyRaw,
    timestamp: String(req.headers["x-allvaps-timestamp"] || ""),
    nonce: String(req.headers["x-allvaps-nonce"] || ""),
    signature: String(req.headers["x-allvaps-signature"] || ""),
    maxSkewSec: cfg.maxSkewSec,
  });
  if (!auth.ok) {
    json(res, 401, { ok: false, error: "auth_failed", detail: auth.message });
    return false;
  }
  return true;
}

async function handleStatus(req: http.IncomingMessage, res: http.ServerResponse) {
  if (!(await requireHmac(req, res, ""))) return;
  const started = process.uptime();
  const ollamaOk = await probeOllama(cfg.ollamaBaseUrl);
  json(res, 200, {
    ok: ollamaOk && !breaker.open,
    service: "ava-llm-gateway",
    uptimeSec: Math.round(started),
    ollama: ollamaOk ? "up" : "down",
    circuit: breaker.open ? "open" : "closed",
    primaryModel: cfg.primaryModel,
    fallbackModel: cfg.fallbackModel,
    allowedModels: cfg.allowedModels,
    host: cfg.host,
    port: cfg.port,
  });
}

async function handleModels(req: http.IncomingMessage, res: http.ServerResponse) {
  if (!(await requireHmac(req, res, ""))) return;
  let installed: string[] = [];
  try {
    const r = await fetch(`${cfg.ollamaBaseUrl}/api/tags`);
    if (r.ok) {
      const j = (await r.json()) as { models?: Array<{ name?: string }> };
      installed = (j.models || []).map((m) => m.name || "").filter(Boolean);
    }
  } catch {
    /* ignore */
  }
  const present = cfg.allowedModels.filter((m) => installed.includes(m));
  json(res, 200, {
    ok: true,
    primaryModel: cfg.primaryModel,
    fallbackModel: cfg.fallbackModel,
    allowed: cfg.allowedModels,
    installedAllowed: present,
  });
}

async function handleChat(req: http.IncomingMessage, res: http.ServerResponse) {
  if (!cfg.secret || cfg.secret.length < 32) {
    return json(res, 503, { ok: false, error: "gateway_secret_missing" });
  }

  const key = clientKey(req);
  if (!rate.allow(key)) {
    return json(res, 429, { ok: false, error: "rate_limited" });
  }

  if (breaker.open) {
    return json(res, 503, {
      ok: false,
      error: "circuit_open",
      message: "Moteur local temporairement indisponible",
    });
  }

  let bodyRaw = "";
  try {
    bodyRaw = await readBody(req, cfg.maxBodyBytes);
  } catch {
    return json(res, 413, { ok: false, error: "body_too_large" });
  }

  const auth = assertRequestAuth({
    secret: cfg.secret,
    body: bodyRaw,
    timestamp: String(req.headers["x-allvaps-timestamp"] || ""),
    nonce: String(req.headers["x-allvaps-nonce"] || ""),
    signature: String(req.headers["x-allvaps-signature"] || ""),
    maxSkewSec: cfg.maxSkewSec,
  });
  if (!auth.ok) {
    return json(res, 401, { ok: false, error: "auth_failed", detail: auth.message });
  }

  let parsed: {
    model?: string;
    messages?: ChatMessage[];
    maxTokens?: number;
    temperature?: number;
    jsonMode?: boolean;
    preferFallback?: boolean;
  };
  try {
    parsed = JSON.parse(bodyRaw);
  } catch {
    return json(res, 400, { ok: false, error: "invalid_json" });
  }

  if (!Array.isArray(parsed.messages) || !parsed.messages.length) {
    return json(res, 400, { ok: false, error: "messages_required" });
  }
  for (const m of parsed.messages) {
    if (!m || !["system", "user", "assistant"].includes(m.role) || typeof m.content !== "string") {
      return json(res, 400, { ok: false, error: "invalid_message" });
    }
    if (m.content.length > 50_000) {
      return json(res, 400, { ok: false, error: "message_too_long" });
    }
  }

  const preferFallback =
    Boolean(parsed.preferFallback) || freemem() / 1024 ** 3 < 4;
  const model = pickModel(cfg, parsed.model, preferFallback);
  if (!model) {
    return json(res, 400, {
      ok: false,
      error: "model_not_allowed",
      allowed: cfg.allowedModels,
    });
  }

  const ollamaOk = await probeOllama(cfg.ollamaBaseUrl);
  if (!ollamaOk) {
    breaker.fail();
    return json(res, 503, {
      ok: false,
      error: "ollama_down",
      message: "Moteur local temporairement indisponible",
    });
  }

  let result = await chatOllama({
    cfg,
    model,
    messages: parsed.messages,
    maxTokens: parsed.maxTokens,
    temperature: parsed.temperature,
    jsonMode: parsed.jsonMode,
  });

  // Un seul fallback modèle si échec (pas de boucle)
  if (!result.ok && model !== cfg.fallbackModel && cfg.allowedModels.includes(cfg.fallbackModel)) {
    console.warn(`[ava-llm-gateway] primary ${model} fail → fallback ${cfg.fallbackModel}`);
    result = await chatOllama({
      cfg,
      model: cfg.fallbackModel,
      messages: parsed.messages,
      maxTokens: parsed.maxTokens,
      temperature: parsed.temperature,
      jsonMode: parsed.jsonMode,
    });
    if (result.ok) {
      breaker.success();
      return json(res, 200, {
        ok: true,
        text: result.text,
        model: cfg.fallbackModel,
        latencyMs: result.latencyMs,
        fallbackUsed: true,
      });
    }
  }

  if (!result.ok) {
    breaker.fail();
    return json(res, 502, {
      ok: false,
      error: "ollama_chat_failed",
      detail: result.error,
      message: "Moteur local temporairement indisponible",
    });
  }

  breaker.success();
  return json(res, 200, {
    ok: true,
    text: result.text,
    model,
    latencyMs: result.latencyMs,
    fallbackUsed: false,
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${cfg.host}:${cfg.port}`);
  try {
    // Index local — le navigateur sur / ne doit plus voir un « not_found » trompeur
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "")) {
      return json(res, 200, {
        ok: true,
        service: "ava-llm-gateway",
        message:
          "Passerelle A.V.A. locale. Ollama n'est pas exposé. Utilisez les routes ci-dessous.",
        routes: [
          { method: "GET", path: "/health", auth: "none" },
          { method: "GET", path: "/status", auth: "HMAC" },
          { method: "GET", path: "/models", auth: "HMAC" },
          { method: "POST", path: "/v1/ava/chat", auth: "HMAC" },
        ],
        note: "Ne pas ouvrir le port Ollama 11434 sur Internet.",
      });
    }
    if (req.method === "GET" && url.pathname === "/health") {
      return await handleHealth(req, res);
    }
    if (req.method === "GET" && url.pathname === "/status") {
      return await handleStatus(req, res);
    }
    if (req.method === "GET" && url.pathname === "/models") {
      return await handleModels(req, res);
    }
    if (req.method === "POST" && url.pathname === "/v1/ava/chat") {
      return await handleChat(req, res);
    }
    // Tout le reste refusé — pas de proxy Ollama générique
    return json(res, 404, {
      ok: false,
      error: "not_found",
      hint: "Routes: GET / · GET /health · GET /status (HMAC) · GET /models (HMAC) · POST /v1/ava/chat (HMAC)",
    });
  } catch (e) {
    console.error("[ava-llm-gateway] unhandled", e instanceof Error ? e.message : e);
    return json(res, 500, { ok: false, error: "internal" });
  }
});

if (!cfg.secret || cfg.secret.length < 32) {
  console.error(
    "[ava-llm-gateway] AVA_LLM_GATEWAY_SECRET manquant (≥32 chars) ou fichier .local/ava-llm-gateway/gateway.secret"
  );
  process.exit(1);
}

server.listen(cfg.port, cfg.host, () => {
  console.info(
    `[ava-llm-gateway] listening http://${cfg.host}:${cfg.port} ollama=${cfg.ollamaBaseUrl} secret=${fingerprintSecret(cfg.secret)} models=${cfg.allowedModels.join(",")}`
  );
  console.info(
    `[ava-llm-gateway] endpoints: GET /health · GET /status(HMAC) · GET /models(HMAC) · POST /v1/ava/chat`
  );
  console.info(`[ava-llm-gateway] Ollama :11434 must stay localhost-only`);
});
