/**
 * Niveaux de mémoire « humaine » — façade sur la mémoire Admin existante.
 * Aucun modèle ne possède la mémoire : elle appartient à l'orchestrateur.
 *
 * Catégories exposées (obligation métier) :
 * working_memory · episodic_memory · semantic_memory · business_memory ·
 * task_memory · user_preference · confirmed_fact · pending_decision ·
 * completed_action · superseded
 */

import type {
  AdminMemoryItem,
  AdminPersistentMemory,
  AdminSessionMemory,
} from "@/lib/ava/admin-memory/types";
import { retrieveRelevantAdminMemory } from "@/lib/ava/admin-memory/retrieve";

export type AvaMemoryLayer =
  | "working"
  | "episodic"
  | "semantic"
  | "business"
  | "task"
  | "relationship";

/** Noms canoniques demandés pour le cerveau Admin. */
export type AvaMemoryCategory =
  | "working_memory"
  | "episodic_memory"
  | "semantic_memory"
  | "business_memory"
  | "task_memory"
  | "user_preference"
  | "confirmed_fact"
  | "pending_decision"
  | "completed_action"
  | "superseded";

export type AvaMemoryEnvelope = {
  layer: AvaMemoryLayer;
  id: string;
  subject: string;
  content: string;
  source: string;
  date: string;
  importance: "low" | "medium" | "high";
  confidence: number;
  category: AvaMemoryCategory | string;
  lastUsedAt: string;
};

function mapKindToLayer(item: AdminMemoryItem): AvaMemoryLayer {
  if (item.status === "superseded") return "episodic";
  if (item.taskStatus && item.taskStatus !== "done") return "task";
  if (item.kind === "user_preference") return "relationship";
  if (item.kind === "pending_decision" || item.kind === "temporary_context") return "episodic";
  if (item.kind === "completed_action") return "episodic";
  if (item.kind === "confirmed_fact") {
    if (
      /boutique|hautmont|quesnoy|stock|commande|produit|fabricant|gamme/i.test(
        item.subject + item.content
      )
    ) {
      return "business";
    }
    return "semantic";
  }
  return "semantic";
}

export function categoryForItem(item: AdminMemoryItem): AvaMemoryCategory {
  if (item.status === "superseded") return "superseded";
  if (item.taskStatus && item.taskStatus !== "done") return "task_memory";
  if (item.kind === "user_preference") return "user_preference";
  if (item.kind === "pending_decision") return "pending_decision";
  if (item.kind === "completed_action") return "completed_action";
  if (item.kind === "confirmed_fact") {
    if (
      /boutique|hautmont|quesnoy|stock|commande|produit|fabricant|gamme/i.test(
        item.subject + item.content
      )
    ) {
      return "business_memory";
    }
    return "confirmed_fact";
  }
  if (item.kind === "temporary_context") return "episodic_memory";
  return "semantic_memory";
}

function confidenceFor(item: AdminMemoryItem): number {
  if (item.source === "user" || item.source === "correction") return 90;
  if (item.source === "tool") return 80;
  if (item.kind === "confirmed_fact") return 75;
  if (item.kind === "pending_decision") return 60;
  return 50;
}

export function toMemoryEnvelope(item: AdminMemoryItem): AvaMemoryEnvelope {
  return {
    layer: mapKindToLayer(item),
    id: item.id,
    subject: item.subject,
    content: item.content,
    source: item.source,
    date: item.createdAt,
    importance: item.importance,
    confidence: confidenceFor(item),
    category: categoryForItem(item),
    lastUsedAt: item.updatedAt,
  };
}

/**
 * Construit le bloc contexte mémoire pour un prompt LLM —
 * sélectif, jamais la base entière, jamais d'invention.
 * Les items superseded ne sont jamais injectés comme vérité.
 */
export function buildOrchestratorMemoryBlock(params: {
  persistent: AdminPersistentMemory;
  session: AdminSessionMemory | null;
  message: string;
  topicHint?: string | null;
}): {
  factsBlock: string;
  envelopes: AvaMemoryEnvelope[];
  layersPresent: AvaMemoryLayer[];
  categoriesPresent: string[];
  activeCount: number;
} {
  const retrieved = retrieveRelevantAdminMemory(params);
  // Double filet : jamais de superseded comme vérité
  const safeItems = retrieved.items.filter((i) => i.status === "active");
  const envelopes = safeItems.map(toMemoryEnvelope);

  if (params.session?.summary) {
    envelopes.unshift({
      layer: "working",
      id: `working:${params.session.conversationId}`,
      subject: params.session.lastTopic || "session",
      content: params.session.summary.slice(0, 600),
      source: "ava",
      date: params.session.updatedAt,
      importance: "high",
      confidence: 85,
      category: "working_memory",
      lastUsedAt: params.session.updatedAt,
    });
  }

  const layersPresent = [...new Set(envelopes.map((e) => e.layer))];
  const categoriesPresent = [...new Set(envelopes.map((e) => String(e.category)))];
  const activeCount = params.persistent.items.filter((i) => i.status === "active").length;

  const lines = [
    "MÉMOIRE A.V.A. (orchestrateur — ne pas inventer hors de cette liste ; superseded exclus) :",
    ...envelopes.slice(0, 12).map(
      (e) =>
        `- [${e.category}|${e.layer}|conf=${e.confidence}] ${e.subject}: ${e.content}`
    ),
  ];

  return {
    factsBlock: lines.join("\n") || retrieved.factsBlock,
    envelopes,
    layersPresent,
    categoriesPresent,
    activeCount,
  };
}
