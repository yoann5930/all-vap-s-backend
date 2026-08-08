/**
 * Comportement social Admin A.V.A. — collègue de travail, pas chatbot.
 * Objets auditables uniquement (pas de chaîne de pensée privée).
 */

export type SocialMove =
  | "greeting"
  | "check_in"
  | "ask_opinion"
  | "defer"
  | "resume"
  | "disagree_prompt"
  | "identity"
  | "thanks"
  | "light_ack"
  | "work";

export type ActiveThread = {
  subject: string;
  summary: string;
  status: "open" | "deferred" | "closed";
  deferredNote?: string;
  lastQuestion?: string;
  updatedAt: string;
};

export type SocialStance = {
  subject: string;
  position: string;
  reason: string;
  askBack?: string;
};

export type SocialDetection = {
  move: SocialMove;
  /** Sujet implicite résolu (session / historique) */
  resolvedSubject: string | null;
  /** Préférer composer localement plutôt qu'OpenAI */
  preferLocalCompose: boolean;
  /** Lancer les outils métier malgré le move social */
  wantTools: boolean;
  preferShort: boolean;
};

export type SocialComposeInput = {
  move: SocialMove;
  ownerFirstName: string | null;
  message: string;
  resolvedSubject: string | null;
  activeThread: ActiveThread | null;
  /** Texte outil déjà humanisé (tour, stocks…) */
  workSignal: string | null;
  /** Avis métier déjà calculé */
  stance: SocialStance | null;
  memoryHint: string | null;
};
