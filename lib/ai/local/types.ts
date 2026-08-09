/**
 * Couche d'inférence locale générique — indépendante d'Ollama.
 * Les runtimes (Ollama, llama.cpp, …) implémentent cette interface.
 */

export type LocalRuntimeId = "ollama" | "llamacpp" | "openai_compatible";

/** Rôles moteurs internes — l'utilisateur ne voit jamais le nom du modèle. */
export type AvaEngineRole =
  | "conversation"
  | "reasoning"
  | "json_extract"
  | "summary"
  | "tool_call"
  | "reflection";

export type LocalChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LocalChatRequest = {
  model: string;
  messages: LocalChatMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Demande de JSON strict si le runtime le permet. */
  jsonMode?: boolean;
  timeoutMs?: number;
};

export type LocalChatResponse = {
  ok: boolean;
  text: string | null;
  model: string;
  runtime: LocalRuntimeId;
  latencyMs: number;
  error?: string | null;
  tokensApprox?: number | null;
};

export type LocalModelInfo = {
  name: string;
  sizeBytes?: number;
  family?: string | null;
};

export interface LocalAIRuntime {
  readonly id: LocalRuntimeId;
  isReachable(): Promise<boolean>;
  listModels(): Promise<LocalModelInfo[]>;
  chat(req: LocalChatRequest): Promise<LocalChatResponse>;
}

export type EngineRoleAssignment = {
  role: AvaEngineRole;
  /** Modèles candidats ordonnés (premier = préféré si installé). */
  candidates: string[];
  /** RAM indicative minimum (Go). */
  minRamGb: number;
  description: string;
};

export type ModelScorecard = {
  model: string;
  runtime: LocalRuntimeId;
  ramPeakGbApprox: number | null;
  loadMs: number | null;
  tokensPerSec: number | null;
  french: number;
  conversation: number;
  reasoning: number;
  json: number;
  tools: number;
  systemPrompt: number;
  hallucinationResistance: number;
  contextUse: number;
  voiceTypos: number;
  total: number;
  notes: string[];
  errors: string[];
};

export type RouterDecision = {
  role: AvaEngineRole;
  model: string;
  runtime: LocalRuntimeId;
  reason: string;
  fallbacks: string[];
};
