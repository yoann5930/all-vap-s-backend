import { OpenAIAvaProvider } from "./openai-provider";
import { OllamaAvaProvider, getOllamaBaseUrl, getOllamaModel } from "./ollama-provider";
import {
  resolveAvaLlmProviderMode,
  type AvaLlmChatRequest,
  type AvaLlmChatResult,
  type AvaLlmFailureKind,
} from "./types";
import { adminOpenAIUnavailableMessage } from "@/lib/ai/openai-chat";
import {
  chatWithEngineRole,
  getLocalAiGatewayUrl,
  getReachableRuntime,
  inferEngineRole,
  localBrainEndpointLabel,
  type AvaEngineRole,
} from "@/lib/ai/local";

const localProvider = new OllamaAvaProvider();
const openaiProvider = new OpenAIAvaProvider();

export function getAvaLlmProviders() {
  return { local: localProvider, openai: openaiProvider };
}

export function adminLlmUnavailableMessage(
  kind: AvaLlmFailureKind,
  tried: Array<"local" | "openai">
): string {
  if (kind === "insufficient_quota" || kind === "rate_limit_exceeded" || kind === "tokens_limit") {
    return adminOpenAIUnavailableMessage(kind as Parameters<typeof adminOpenAIUnavailableMessage>[0]);
  }
  if (kind === "provider_unavailable" || kind === "network_error" || kind === "network_timeout") {
    const via = tried.length ? ` (tenté : ${tried.join(" → ")})` : "";
    const gw = getLocalAiGatewayUrl();
    if (gw || tried.includes("local")) {
      return `Moteur local temporairement indisponible${via}. Vérifie le PC fixe (Ollama + ava-llm-gateway + Caddy). Je ne simule pas une réponse LLM.`;
    }
    return `Aucun moteur IA joignable pour A.V.A. Admin${via}. Démarre Ollama en local (provider=local) ou régularise OpenAI. Je ne simule pas une réponse LLM.`;
  }
  if (kind === "model_not_found") {
    return `Le modèle local configuré (${getOllamaModel()}) est introuvable dans Ollama. Lance « ollama pull ${getOllamaModel()} » sur le PC fixe.`;
  }
  if (kind === "missing_key") {
    return adminOpenAIUnavailableMessage("missing_key");
  }
  return `Moteur IA indisponible (${kind}). Je ne fabule pas une réponse — vérifie AVA_LLM_PROVIDER / Ollama / OpenAI.`;
}

async function chatLocalMultiEngine(
  req: AvaLlmChatRequest
): Promise<AvaLlmChatResult> {
  const lastUser =
    [...req.messages].reverse().find((m) => m.role === "user")?.content || "";
  const role: AvaEngineRole = inferEngineRole(lastUser, Boolean(req.preferShort));

  const result = await chatWithEngineRole({
    role,
    messages: req.messages,
    maxTokens: req.maxTokens ?? (req.preferShort ? 320 : 900),
    temperature: req.temperature ?? (req.preferShort ? 0.45 : 0.55),
    logTag: req.logTag || "ava-llm-local-multi",
  });

  if (result.ok) {
    return {
      ok: true,
      text: result.text,
      provider: "local",
      model: result.model,
      kind: "ok",
      httpStatus: 200,
      apiCode: null,
      apiMessage: null,
      attempts: result.triedModels.length,
      latencyMs: result.latencyMs,
      tried: ["local"],
    };
  }

  const fallback = await localProvider.chat(req);
  return {
    ...fallback,
    tried: ["local"],
    apiMessage:
      fallback.apiMessage ||
      result.error ||
      `multi-engine fail tried=${result.triedModels.join(",")}`,
  };
}

/**
 * Routage : multi-moteurs locaux → OpenAI optionnel (auto), sans boucle.
 */
export async function chatWithAvaLlm(
  req: AvaLlmChatRequest
): Promise<AvaLlmChatResult> {
  const mode = resolveAvaLlmProviderMode();
  const tried: Array<"local" | "openai"> = [];
  const tag = req.logTag || "ava-llm-router";

  const tryLocal = mode === "local" || mode === "auto";
  const tryOpenAI = mode === "openai" || mode === "auto";

  if (tryLocal) {
    tried.push("local");
    const rt = await getReachableRuntime();
    if (rt) {
      const result = await chatLocalMultiEngine(req);
      if (result.ok) {
        console.info(
          `[${tag}] provider=local model=${result.model} latencyMs=${result.latencyMs}`
        );
        return { ...result, tried };
      }
      if (mode === "local") {
        return { ...result, tried };
      }
      console.warn(
        `[${tag}] failover local→openai kind=${result.kind} (one-shot, no loop)`
      );
    } else if (mode === "local") {
      return {
        ok: false,
        text: null,
        provider: "none",
        model: getOllamaModel(),
        kind: "provider_unavailable",
        httpStatus: null,
        apiCode: null,
        apiMessage: `Moteur local temporairement indisponible (${localBrainEndpointLabel()})`,
        attempts: 0,
        latencyMs: 0,
        tried,
      };
    } else {
      console.warn(`[${tag}] local unreachable → try openai (one-shot)`);
    }
  }

  if (tryOpenAI) {
    if (!tried.includes("openai")) tried.push("openai");
    const result = await openaiProvider.chat(req);
    if (result.ok) {
      console.info(
        `[${tag}] provider=openai model=${result.model} latencyMs=${result.latencyMs} failover=${tried.includes("local")}`
      );
    }
    return {
      ...result,
      tried,
      failoverLogged: tried.includes("local") && tried.includes("openai"),
    };
  }

  return {
    ok: false,
    text: null,
    provider: "none",
    model: null,
    kind: "provider_unavailable",
    httpStatus: null,
    apiCode: null,
    apiMessage: `Mode ${mode} sans provider disponible`,
    attempts: 0,
    latencyMs: 0,
    tried,
  };
}

export async function probeAvaLlmProviders(): Promise<{
  mode: string;
  local: {
    configured: boolean;
    reachable: boolean;
    baseUrl: string;
    model: string;
  };
  gateway: {
    configured: boolean;
    url: string | null;
  };
  openai: { configured: boolean };
  multiEngine?: {
    runtime: string | null;
    installedModels: string[];
  };
}> {
  const mode = resolveAvaLlmProviderMode();
  const rt = await getReachableRuntime();
  const installed = rt ? (await rt.listModels()).map((m) => m.name) : [];
  const gwUrl = getLocalAiGatewayUrl() || null;
  const gatewayConfigured = Boolean(gwUrl);
  // Reachable = runtime multi-engine (gateway prioritaire si configuré)
  const reachable = Boolean(rt) || (await localProvider.isReachable());
  return {
    mode,
    local: {
      configured: localProvider.isConfigured() || gatewayConfigured,
      reachable,
      baseUrl: gwUrl || getOllamaBaseUrl(),
      model: getOllamaModel(),
    },
    gateway: {
      configured: gatewayConfigured,
      url: gwUrl,
    },
    openai: { configured: openaiProvider.isConfigured() },
    multiEngine: {
      runtime: rt?.id || null,
      installedModels: installed,
    },
  };
}
