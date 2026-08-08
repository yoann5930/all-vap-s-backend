import { getAvaMemory, setAvaMemory } from "@/lib/ava/memory-store";
import { randomBytes } from "crypto";
import type {
  BiBusinessMemoryItem,
  BiExperiment,
  BiMarketSignal,
  BiReflectionCard,
} from "./types";

const KEY_MEMORY = "bi_business_memory";
const KEY_EXPERIMENTS = "bi_experiments";
const KEY_REFLECTIONS = "bi_reflections";
const KEY_MARKET = "bi_market_signals";

function now() {
  return new Date().toISOString();
}
function id(p: string) {
  return `${p}_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
}

async function loadJson<T>(ownerUserId: string, key: string, fallback: T): Promise<T> {
  try {
    const raw = await getAvaMemory({ scope: "ADMIN", ownerUserId, key });
    if (!raw) return fallback;
    return raw as T;
  } catch {
    return fallback;
  }
}

async function saveJson(ownerUserId: string, key: string, value: unknown) {
  await setAvaMemory({
    scope: "ADMIN",
    ownerUserId,
    key,
    value,
    source: "ava_bi",
  });
}

export async function listBusinessMemory(ownerUserId: string): Promise<BiBusinessMemoryItem[]> {
  const data = await loadJson<{ items: BiBusinessMemoryItem[] }>(ownerUserId, KEY_MEMORY, {
    items: [],
  });
  return (data.items || []).filter((i) => i.status === "active");
}

export async function upsertBusinessMemory(
  ownerUserId: string,
  input: Omit<BiBusinessMemoryItem, "id" | "createdAt" | "updatedAt" | "status"> & {
    status?: BiBusinessMemoryItem["status"];
  }
): Promise<BiBusinessMemoryItem> {
  const data = await loadJson<{ items: BiBusinessMemoryItem[] }>(ownerUserId, KEY_MEMORY, {
    items: [],
  });
  const items = data.items || [];
  const existing = items.find(
    (i) =>
      i.status === "active" &&
      i.kind === input.kind &&
      i.subject.toLowerCase() === input.subject.toLowerCase()
  );
  if (existing) {
    existing.status = "superseded";
    existing.updatedAt = now();
  }
  const item: BiBusinessMemoryItem = {
    id: id("bf"),
    kind: input.kind,
    subject: input.subject,
    content: input.content.slice(0, 800),
    confidence: input.confidence,
    status: "active",
    createdAt: now(),
    updatedAt: now(),
    source: input.source,
  };
  items.unshift(item);
  await saveJson(ownerUserId, KEY_MEMORY, { items: items.slice(0, 200), updatedAt: now() });
  return item;
}

export async function listExperiments(ownerUserId: string): Promise<BiExperiment[]> {
  const data = await loadJson<{ items: BiExperiment[] }>(ownerUserId, KEY_EXPERIMENTS, {
    items: [],
  });
  return data.items || [];
}

export async function saveExperiment(
  ownerUserId: string,
  experiment: BiExperiment
): Promise<BiExperiment> {
  const data = await loadJson<{ items: BiExperiment[] }>(ownerUserId, KEY_EXPERIMENTS, {
    items: [],
  });
  const items = data.items || [];
  const idx = items.findIndex((e) => e.id === experiment.id);
  if (idx >= 0) items[idx] = experiment;
  else items.unshift(experiment);
  await saveJson(ownerUserId, KEY_EXPERIMENTS, { items: items.slice(0, 100), updatedAt: now() });
  return experiment;
}

export function draftExperimentFromIdea(params: {
  title: string;
  ideaId?: string;
  hypothesis: string;
  durationDays?: number;
  baseline?: Record<string, number | string>;
  objective: string;
  indicators: string[];
}): BiExperiment {
  const t = now();
  return {
    id: id("exp"),
    title: params.title,
    ideaId: params.ideaId,
    hypothesis: params.hypothesis,
    durationDays: params.durationDays ?? 7,
    baseline: params.baseline || {},
    objective: params.objective,
    indicators: params.indicators,
    status: "draft",
    createdAt: t,
    updatedAt: t,
  };
}

export async function concludeExperiment(
  ownerUserId: string,
  experimentId: string,
  result: NonNullable<BiExperiment["result"]>
): Promise<BiExperiment | null> {
  const items = await listExperiments(ownerUserId);
  const exp = items.find((e) => e.id === experimentId);
  if (!exp) return null;
  exp.status = "completed";
  exp.endedAt = now();
  exp.updatedAt = now();
  exp.result = { ...result, correlationOnly: true };
  await saveExperiment(ownerUserId, exp);
  await upsertBusinessMemory(ownerUserId, {
    kind: "LEARNING",
    subject: exp.title,
    content: result.learning,
    confidence: 60,
    source: "experiment_result",
  });
  await upsertBusinessMemory(ownerUserId, {
    kind: "RESULT",
    subject: exp.title,
    content: result.summary,
    confidence: 65,
    source: "experiment_result",
  });
  return exp;
}

export async function saveReflections(
  ownerUserId: string,
  cards: BiReflectionCard[]
): Promise<void> {
  await saveJson(ownerUserId, KEY_REFLECTIONS, {
    items: cards.slice(0, 40),
    updatedAt: now(),
  });
}

export async function listReflections(ownerUserId: string): Promise<BiReflectionCard[]> {
  const data = await loadJson<{ items: BiReflectionCard[] }>(ownerUserId, KEY_REFLECTIONS, {
    items: [],
  });
  return data.items || [];
}

export async function saveMarketSignals(
  ownerUserId: string,
  signals: BiMarketSignal[]
): Promise<void> {
  const prev = await loadJson<{ items: BiMarketSignal[] }>(ownerUserId, KEY_MARKET, {
    items: [],
  });
  const merged = [...signals, ...(prev.items || [])].slice(0, 80);
  await saveJson(ownerUserId, KEY_MARKET, { items: merged, updatedAt: now() });
}

export async function listMarketSignals(ownerUserId: string): Promise<BiMarketSignal[]> {
  const data = await loadJson<{ items: BiMarketSignal[] }>(ownerUserId, KEY_MARKET, {
    items: [],
  });
  return data.items || [];
}
