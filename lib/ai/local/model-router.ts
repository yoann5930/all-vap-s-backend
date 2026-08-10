import { OllamaLocalRuntime } from "./runtime-ollama";
import { LlamaCppLocalRuntime } from "./runtime-llamacpp";
import { pickInstalledModel, roleAssignment } from "./model-registry";
import type {
  AvaEngineRole,
  LocalAIRuntime,
  LocalChatMessage,
  LocalChatResponse,
  RouterDecision,
} from "./types";
import { scrubSecretsForLlm } from "@/lib/ai/providers/types";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

function freeRamGb(): number {
  try {
    const os = require("os") as typeof import("os");
    return Math.round((os.freemem() / 1024 ** 3) * 10) / 10;
  } catch {
    return 8;
  }
}

function totalRamGb(): number {
  try {
    const os = require("os") as typeof import("os");
    return Math.round((os.totalmem() / 1024 ** 3) * 10) / 10;
  } catch {
    return 16;
  }
}

type RoleMapFile = {
  roles?: Partial<Record<AvaEngineRole, string>>;
  fallbacks?: Partial<Record<AvaEngineRole, string[]>>;
};

function loadRoleMap(): RoleMapFile | null {
  try {
    const p = join(process.cwd(), "data", "ava", "engine-role-map.json");
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, "utf8")) as RoleMapFile;
  } catch {
    return null;
  }
}

export function getLocalRuntimes(): LocalAIRuntime[] {
  const runtimes: LocalAIRuntime[] = [new OllamaLocalRuntime()];
  const llama = new LlamaCppLocalRuntime();
  if (llama.isConfigured()) runtimes.push(llama);
  return runtimes;
}

export async function getReachableRuntime(): Promise<LocalAIRuntime | null> {
  for (const rt of getLocalRuntimes()) {
    if (await rt.isReachable()) return rt;
  }
  return null;
}

/**
 * Choisit le moteur pour un rôle — sans exposer le nom au user.
 */
export async function decideEngineRole(
  role: AvaEngineRole,
  runtime?: LocalAIRuntime | null
): Promise<RouterDecision | null> {
  const rt = runtime ?? (await getReachableRuntime());
  if (!rt) return null;
  const installed = (await rt.listModels()).map((m) => m.name);
  const map = loadRoleMap();
  const preferred = map?.roles?.[role];
  const mapFallbacks = map?.fallbacks?.[role] || [];

  if (preferred && installed.includes(preferred)) {
    const fallbacks = mapFallbacks.filter((m) => installed.includes(m) && m !== preferred);
    return {
      role,
      model: preferred,
      runtime: rt.id,
      reason: `role=${role} model=${preferred} from engine-role-map ram=${freeRamGb()}/${totalRamGb()}Go`,
      fallbacks,
    };
  }

  const assignment = roleAssignment(role);
  const candidates = preferred
    ? [preferred, ...mapFallbacks, ...assignment.candidates]
    : assignment.candidates;
  const pick = pickInstalledModel(candidates, installed);
  if (!pick) return null;

  const free = freeRamGb();
  if (free < 4) {
    const light = pickInstalledModel(
      candidates.filter((c) => /3b|1b|2b|mini/i.test(c)).concat(candidates),
      installed
    );
    if (light) {
      return {
        role,
        model: light.model,
        runtime: rt.id,
        reason: `role=${role} model=${light.model} low_free_ram`,
        fallbacks: light.fallbacks,
      };
    }
  }

  return {
    role,
    model: pick.model,
    runtime: rt.id,
    reason: `role=${role} model=${pick.model} runtime=${rt.id}`,
    fallbacks: pick.fallbacks,
  };
}

export async function chatWithEngineRole(params: {
  role: AvaEngineRole;
  messages: LocalChatMessage[];
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  logTag?: string;
}): Promise<LocalChatResponse & { decision: RouterDecision | null; triedModels: string[] }> {
  const rt = await getReachableRuntime();
  const decision = await decideEngineRole(params.role, rt);
  const triedModels: string[] = [];
  if (!rt || !decision) {
    return {
      ok: false,
      text: null,
      model: "none",
      runtime: "ollama",
      latencyMs: 0,
      error: "Aucun runtime local joignable ou modèle installé",
      decision: null,
      triedModels,
    };
  }

  const scrubbed = params.messages.map((m) => ({
    ...m,
    content: scrubSecretsForLlm(m.content),
  }));

  const queue = [decision.model, ...decision.fallbacks].filter(
    (m, i, arr) => arr.indexOf(m) === i
  );

  let last: LocalChatResponse = {
    ok: false,
    text: null,
    model: decision.model,
    runtime: rt.id,
    latencyMs: 0,
    error: "no_attempt",
  };

  for (const model of queue.slice(0, 3)) {
    triedModels.push(model);
    const tag = params.logTag || "ava-engine";
    console.info(`[${tag}] role=${params.role} try model=${model} runtime=${rt.id}`);
    last = await rt.chat({
      model,
      messages: scrubbed,
      maxTokens: params.maxTokens,
      temperature: params.temperature,
      jsonMode: params.jsonMode,
    });
    if (last.ok) {
      console.info(
        `[${tag}] role=${params.role} ok model=${model} latencyMs=${last.latencyMs}`
      );
      return { ...last, decision: { ...decision, model }, triedModels };
    }
    console.warn(
      `[${tag}] role=${params.role} fail model=${model} err=${last.error || "-"} → next`
    );
  }

  return { ...last, decision, triedModels };
}

/** Infère un rôle depuis le message admin (heuristique légère, pas un second LLM). */
export function inferEngineRole(message: string, preferShort: boolean): AvaEngineRole {
  const n = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (/json|extrait|structure|schema|ean|barcode|parse/.test(n)) return "json_extract";
  if (/outil|tool|commande\s+outil|appelle|execute|lance\s+le/.test(n)) return "tool_call";
  if (/resume|résume|synthese|synthèse|en\s+bref|tl;dr/.test(n)) return "summary";
  if (
    /pourquoi|analyse|raisonn|compar|strategie|stratégie|hypothes|réflexion|reflexion|conclu/.test(
      n
    )
  ) {
    return "reasoning";
  }
  if (/reflexion|réflexion\s+metier|tour\s+du\s+magasin/.test(n)) return "reflection";
  if (preferShort && n.length < 40) return "summary";
  return "conversation";
}

export { freeRamGb, totalRamGb };
