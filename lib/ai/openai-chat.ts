/**
 * Client OpenAI Chat Completions — Admin / diag.
 * Jamais de clé complète en log ; body d'erreur classifié sans secrets.
 */

export type OpenAIErrorKind =
  | "ok"
  | "missing_key"
  | "auth_rejected"
  | "insufficient_quota"
  | "rate_limit_exceeded"
  | "tokens_limit"
  | "model_not_found"
  | "invalid_request"
  | "openai_5xx"
  | "network_timeout"
  | "network_error"
  | "empty_content"
  | "parse_error"
  | "http_other"
  | "throw";

export type OpenAIChatResult = {
  ok: boolean;
  text: string | null;
  httpStatus: number | null;
  kind: OpenAIErrorKind;
  /** Message OpenAI sanitisé (sans clé / sans PII longue). */
  apiMessage: string | null;
  apiType: string | null;
  apiCode: string | null;
  retryAfterSec: number | null;
  attempts: number;
  latencyMs: number;
  model: string;
  keyFingerprint: string | null;
};

function envTrim(name: string, fallback = ""): string {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.trim().replace(/^["']|["']$/g, "");
}

export function getOpenAIApiKey(): string {
  return envTrim("OPENAI_API_KEY");
}

export function getOpenAIModel(fallback = "gpt-4o-mini"): string {
  return envTrim("OPENAI_MODEL", fallback) || fallback;
}

/** Empreinte sûre : préfixe court + 4 derniers caractères. */
export function fingerprintOpenAIKey(key: string): string | null {
  const k = (key || "").trim();
  if (k.length < 12) return null;
  const prefix = k.startsWith("sk-") ? k.slice(0, Math.min(8, k.length)) : k.slice(0, 4);
  return `${prefix}…${k.slice(-4)}`;
}

function scrubSecretish(s: string): string {
  return s
    .replace(/sk-[a-zA-Z0-9_-]{8,}/g, "[redacted_key]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .slice(0, 280);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function classifyOpenAIHttpError(params: {
  status: number;
  bodyText: string;
  retryAfterHeader?: string | null;
}): {
  kind: OpenAIErrorKind;
  apiMessage: string | null;
  apiType: string | null;
  apiCode: string | null;
  retryAfterSec: number | null;
} {
  const { status, bodyText, retryAfterHeader } = params;
  let apiMessage: string | null = null;
  let apiType: string | null = null;
  let apiCode: string | null = null;
  try {
    const parsed = JSON.parse(bodyText) as {
      error?: { message?: string; type?: string; code?: string | number | null };
    };
    apiMessage = scrubSecretish(String(parsed?.error?.message || ""));
    apiType = parsed?.error?.type ? String(parsed.error.type) : null;
    apiCode =
      parsed?.error?.code != null && parsed.error.code !== ""
        ? String(parsed.error.code)
        : null;
  } catch {
    /* ignore */
  }

  const blob = `${apiType || ""} ${apiCode || ""} ${apiMessage || ""} ${bodyText}`.toLowerCase();
  let kind: OpenAIErrorKind = "http_other";
  if (status === 401 || status === 403) kind = "auth_rejected";
  else if (status === 429) {
    if (/insufficient_quota|exceeded your current quota|billing|payment/i.test(blob)) {
      kind = "insufficient_quota";
    } else if (/token|tpm|tokens_per/i.test(blob) && /rate|limit/i.test(blob)) {
      kind = "tokens_limit";
    } else if (/rate_limit|rate limit|too many requests/i.test(blob)) {
      kind = "rate_limit_exceeded";
    } else {
      // 429 sans détail → traiter comme rate limit transitoire (retry possible)
      kind = "rate_limit_exceeded";
    }
  } else if (status === 404 || /model_not_found|does not exist|not have access to model/i.test(blob)) {
    kind = "model_not_found";
  } else if (status === 400) kind = "invalid_request";
  else if (status >= 500) kind = "openai_5xx";
  else kind = `http_other`;

  let retryAfterSec: number | null = null;
  if (retryAfterHeader) {
    const n = Number(retryAfterHeader);
    if (Number.isFinite(n) && n > 0) retryAfterSec = Math.min(120, Math.ceil(n));
  }
  const m = apiMessage?.match(/try again in ([\d.]+)\s*s/i);
  if (!retryAfterSec && m) {
    retryAfterSec = Math.min(120, Math.ceil(Number(m[1])));
  }

  return { kind, apiMessage: apiMessage || null, apiType, apiCode, retryAfterSec };
}

export function shouldRetryOpenAI(kind: OpenAIErrorKind): boolean {
  return (
    kind === "rate_limit_exceeded" ||
    kind === "tokens_limit" ||
    kind === "openai_5xx" ||
    kind === "network_timeout" ||
    kind === "network_error"
  );
}

/** Message admin clair — ne fait pas croire que le cerveau LLM marche. */
export function adminOpenAIUnavailableMessage(kind: OpenAIErrorKind): string {
  switch (kind) {
    case "insufficient_quota":
      return "OpenAI refuse l'appel : quota / facturation épuisés (insufficient_quota). Je ne peux pas générer de réponse intelligente tant que le compte OpenAI n'est pas régularisé. Les outils métier restent utilisables.";
    case "rate_limit_exceeded":
    case "tokens_limit":
      return "OpenAI est momentanément saturé (rate limit 429). Réessaie dans une minute — je ne simule pas une réponse LLM.";
    case "auth_rejected":
      return "La clé OpenAI est refusée (401/403). Vérifie OPENAI_API_KEY sur cet environnement Vercel — sans coller la clé ici.";
    case "model_not_found":
      return "Le modèle OpenAI configuré est inaccessible. Vérifie OPENAI_MODEL (ex. gpt-4o-mini).";
    case "missing_key":
      return "OPENAI_API_KEY absente sur cet environnement. Impossible d'appeler le cerveau A.V.A.";
    default:
      return "OpenAI est indisponible pour le moment. Je ne fabule pas une réponse — réessaie ou vérifie le diagnostic Preview.";
  }
}

export async function createOpenAIChatCompletion(params: {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  maxTokens?: number;
  temperature?: number;
  /** Max attempts including the first. Default 3 for retryable errors only. */
  maxAttempts?: number;
  /** Log prefix without secrets. */
  logTag?: string;
}): Promise<OpenAIChatResult> {
  const key = getOpenAIApiKey();
  const model = getOpenAIModel();
  const keyFingerprint = fingerprintOpenAIKey(key);
  const maxAttempts = Math.max(1, Math.min(4, params.maxAttempts ?? 3));
  const started = Date.now();

  if (!key || key.length < 20) {
    return {
      ok: false,
      text: null,
      httpStatus: null,
      kind: "missing_key",
      apiMessage: null,
      apiType: null,
      apiCode: null,
      retryAfterSec: null,
      attempts: 0,
      latencyMs: 0,
      model,
      keyFingerprint,
    };
  }

  let last: OpenAIChatResult = {
    ok: false,
    text: null,
    httpStatus: null,
    kind: "throw",
    apiMessage: null,
    apiType: null,
    apiCode: null,
    retryAfterSec: null,
    attempts: 0,
    latencyMs: 0,
    model,
    keyFingerprint,
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: params.messages,
          max_tokens: params.maxTokens ?? 400,
          temperature: params.temperature ?? 0.5,
        }),
      });
      const raw = await res.text();
      const latencyMs = Date.now() - started;

      if (res.ok) {
        let text: string | null = null;
        let kind: OpenAIErrorKind = "ok";
        try {
          const data = JSON.parse(raw) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          text = data.choices?.[0]?.message?.content?.trim() || null;
          if (!text) kind = "empty_content";
        } catch {
          kind = "parse_error";
        }
        last = {
          ok: Boolean(text),
          text,
          httpStatus: res.status,
          kind: text ? "ok" : kind,
          apiMessage: null,
          apiType: null,
          apiCode: null,
          retryAfterSec: null,
          attempts: attempt,
          latencyMs,
          model,
          keyFingerprint,
        };
        if (last.ok) return last;
        break;
      }

      const classified = classifyOpenAIHttpError({
        status: res.status,
        bodyText: raw,
        retryAfterHeader: res.headers.get("retry-after"),
      });
      last = {
        ok: false,
        text: null,
        httpStatus: res.status,
        kind: classified.kind,
        apiMessage: classified.apiMessage,
        apiType: classified.apiType,
        apiCode: classified.apiCode,
        retryAfterSec: classified.retryAfterSec,
        attempts: attempt,
        latencyMs,
        model,
        keyFingerprint,
      };

      const tag = params.logTag || "openai-chat";
      console.warn(
        `[${tag}] http=${res.status} kind=${classified.kind} code=${classified.apiCode || "-"} type=${classified.apiType || "-"} attempt=${attempt}/${maxAttempts} key=${keyFingerprint || "?"} msg=${(classified.apiMessage || "").slice(0, 160)}`
      );

      // Never retry billing/auth/model errors
      if (
        classified.kind === "insufficient_quota" ||
        classified.kind === "auth_rejected" ||
        classified.kind === "model_not_found" ||
        classified.kind === "invalid_request"
      ) {
        return last;
      }

      if (attempt < maxAttempts && shouldRetryOpenAI(classified.kind)) {
        const base = classified.retryAfterSec
          ? classified.retryAfterSec * 1000
          : 800 * Math.pow(2, attempt - 1);
        const jitter = Math.floor(Math.random() * 250);
        await sleep(Math.min(30_000, base + jitter));
        continue;
      }
      return last;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const kind: OpenAIErrorKind = /timeout|aborted/i.test(msg)
        ? "network_timeout"
        : /fetch|ENOTFOUND|ECONN|network/i.test(msg)
          ? "network_error"
          : "throw";
      last = {
        ok: false,
        text: null,
        httpStatus: null,
        kind,
        apiMessage: scrubSecretish(msg),
        apiType: null,
        apiCode: null,
        retryAfterSec: null,
        attempts: attempt,
        latencyMs: Date.now() - started,
        model,
        keyFingerprint,
      };
      console.warn(
        `[${params.logTag || "openai-chat"}] throw kind=${kind} attempt=${attempt}/${maxAttempts}`
      );
      if (attempt < maxAttempts && shouldRetryOpenAI(kind)) {
        await sleep(Math.min(30_000, 800 * Math.pow(2, attempt - 1)));
        continue;
      }
      return last;
    }
  }

  return last;
}
