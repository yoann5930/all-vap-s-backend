/**
 * Mémoire Admin A.V.A. — types structurés (jamais de chaîne de pensée).
 * Scope ADMIN uniquement — jamais injecté côté Client/Vendeuse.
 */

export type AdminMemoryKind =
  | "confirmed_fact"
  | "temporary_context"
  | "pending_decision"
  | "user_preference"
  | "completed_action";

export type AdminMemoryItemStatus = "active" | "superseded" | "archived";

export type AdminTaskStatus = "todo" | "in_progress" | "blocked" | "paused" | "done";

export type AdminMemoryItem = {
  id: string;
  kind: AdminMemoryKind;
  subject: string;
  content: string;
  status: AdminMemoryItemStatus;
  importance: "low" | "medium" | "high";
  taskStatus?: AdminTaskStatus;
  project?: string;
  source: "user" | "tool" | "ava" | "correction";
  createdAt: string;
  updatedAt: string;
  supersededBy?: string | null;
};

export type AdminPersistentMemory = {
  version: 1;
  items: AdminMemoryItem[];
  updatedAt: string;
};

export type AdminSessionMemory = {
  version: 1;
  conversationId: string;
  /** Résumé compact des faits utiles de la session */
  summary: string;
  lastTopic: string | null;
  lastTools: string[];
  openQuestions: string[];
  recentActions: string[];
  /** Dernières réponses assistant (empreintes anti-répétition) */
  recentReplyFingerprints: string[];
  updatedAt: string;
};

export type AdminConversationalIntent =
  | "greeting"
  | "thanks"
  | "whoami"
  | "status_check"
  | "followup"
  | "continuation"
  | "explanation"
  | "action"
  | "diagnostic"
  | "correction"
  | "confirmation"
  | "comparison"
  | "report"
  | "unclear";

export type AdminIntentAnalysis = {
  intent: AdminConversationalIntent;
  /** Réponse courte attendue */
  preferShort: boolean;
  /** Relance / référence au tour précédent */
  isFollowUp: boolean;
  /** Correction utilisateur d'un fait */
  isCorrection: boolean;
  /** Reprise d'un sujet en pause */
  isResume: boolean;
  /** Mise en pause */
  isPause: boolean;
  topicHint: string | null;
};
