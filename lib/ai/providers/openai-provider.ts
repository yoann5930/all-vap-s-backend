import {
  createOpenAIChatCompletion,
  getOpenAIApiKey,
  getOpenAIModel,
  type OpenAIErrorKind,
} from "@/lib/ai/openai-chat";
import type {
  AvaLlmChatRequest,
  AvaLlmChatResult,
  AvaLlmFailureKind,
  AvaLlmProvider,
} from "./types";
import { scrubMessagesForLlm } from "./types";

function mapKind(kind: OpenAIErrorKind): AvaLlmFailureKind {
  return kind as AvaLlmFailureKind;
}

export class OpenAIAvaProvider implements AvaLlmProvider {
  readonly id = "openai" as const;

  isConfigured(): boolean {
    return getOpenAIApiKey().length > 20;
  }

  async isReachable(): Promise<boolean> {
    return this.isConfigured();
  }

  async chat(req: AvaLlmChatRequest): Promise<AvaLlmChatResult> {
    if (!this.isConfigured()) {
      return {
        ok: false,
        text: null,
        provider: "none",
        model: getOpenAIModel(),
        kind: "missing_key",
        httpStatus: null,
        apiCode: null,
        apiMessage: null,
        attempts: 0,
        latencyMs: 0,
        tried: ["openai"],
      };
    }

    const result = await createOpenAIChatCompletion({
      messages: scrubMessagesForLlm(req.messages),
      maxTokens:
        req.maxTokens ?? (req.preferShort ? 320 : 900),
      temperature: req.temperature ?? (req.preferShort ? 0.45 : 0.55),
      maxAttempts: 3,
      logTag: req.logTag || "ava-llm-openai",
    });

    return {
      ok: result.ok,
      text: result.text,
      provider: result.ok ? "openai" : "openai",
      model: result.model,
      kind: mapKind(result.kind),
      httpStatus: result.httpStatus,
      apiCode: result.apiCode,
      apiMessage: result.apiMessage,
      attempts: result.attempts,
      latencyMs: result.latencyMs,
      tried: ["openai"],
    };
  }
}
