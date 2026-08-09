import { OpenAIAvaProvider } from "./openai-provider";
import { OllamaAvaProvider, getOllamaBaseUrl, getOllamaModel } from "./ollama-provider";
import {
  resolveAvaLlmProviderMode,
  type AvaLlmChatRequest,
  type AvaLlmChatResult,
  type AvaLlmFailureKind,
} from "./types";
import { adminOpenAIUnavailableMessage } from "@/lib/ai/openai-chat";

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

/**
 * Routage unique : local → openai (auto), sans boucle.
 * OpenAI reste optionnel ; local gratuit en priorité.
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
    const reachable = await localProvider.isReachable();
    if (reachable) {
      const result = await localProvider.chat(req);
      if (result.ok) {
        console.info(
          `[${tag}] provider=local model=${result.model} latencyMs=${result.latencyMs}`
        );
        return { ...result, tried };
      }
      // Local joignable mais échec modèle → en auto, tenter openai une fois
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
        apiMessage: `Ollama injoignable à ${getOllamaBaseUrl()}`,
        attempts: 0,
        latencyMs: 0,
        tried,
      };
    } else {
      console.warn(
        `[${tag}] local unreachable at ${getOllamaBaseUrl()} → try openai`
      );
    }
  }

  if (tryOpenAI) {
    // Ne jamais reboucler : openai au plus une fois
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
  openai: { configured: boolean };
}> {
  const mode = resolveAvaLlmProviderMode();
  const reachable = await localProvider.isReachable();
  return {
    mode,
    local: {
      configured: localProvider.isConfigured(),
      reachable,
      baseUrl: getOllamaBaseUrl(),
      model: getOllamaModel(),
    },
    openai: { configured: openaiProvider.isConfigured() },
  };
}
