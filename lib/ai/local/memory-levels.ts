/**
 * Niveaux de mémoire « humaine » — façade sur la mémoire Admin existante.
 * Aucun modèle ne possède la mémoire : elle appartient à l'orchestrateur.
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

export type AvaMemoryEnvelope = {
  layer: AvaMemoryLayer;
  id: string;
  subject: string;
  content: string;
  source: string;
  date: string;
  importance: "low" | "medium" | "high";
  confidence: number;
  category: string;
  lastUsedAt: string;
};

function mapKindToLayer(item: AdminMemoryItem): AvaMemoryLayer {
  if (item.taskStatus && item.taskStatus !== "done") return "task";
  if (item.kind === "user_preference") return "relationship";
  if (item.kind === "pending_decision" || item.kind === "temporary_context") return "episodic";
  if (item.kind === "completed_action") return "episodic";
  if (item.kind === "confirmed_fact") {
    if (/boutique|hautmont|quesnoy|stock|commande|produit|fabricant|gamme/i.test(item.subject + item.content)) {
      return "business";
    }
    return "semantic";
  }
  return "semantic";
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
    category: item.kind,
    lastUsedAt: item.updatedAt,
  };
}

/**
 * Construit le bloc contexte mémoire pour un prompt LLM —
 * sélectif, jamais la base entière, jamais d'invention.
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
} {
  const retrieved = retrieveRelevantAdminMemory(params);
  const envelopes = retrieved.items.map(toMemoryEnvelope);

  // Working memory = session
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
      category: "working_session",
      lastUsedAt: params.session.updatedAt,
    });
  }

  const layersPresent = [...new Set(envelopes.map((e) => e.layer))];
  const lines = [
    "MÉMOIRE A.V.A. (orchestrateur — ne pas inventer hors de cette liste) :",
    ...envelopes.slice(0, 12).map(
      (e) =>
        `- [${e.layer}|${e.category}|conf=${e.confidence}] ${e.subject}: ${e.content}`
    ),
  ];

  return {
    factsBlock: lines.join("\n") || retrieved.factsBlock,
    envelopes,
    layersPresent,
  };
}
