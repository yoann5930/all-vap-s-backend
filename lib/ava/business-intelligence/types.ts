/**
 * A.V.A. Business Intelligence — objets métier structurés (pas de chaîne de pensée privée).
 * Surface ADMIN uniquement.
 */

export type BiConfidence = number; // 0–100

export type BiPriorityScore = {
  impact: 1 | 2 | 3 | 4 | 5;
  urgency: 1 | 2 | 3 | 4 | 5;
  confidence: BiConfidence;
  effort: 1 | 2 | 3 | 4 | 5;
};

export type BiObservation = {
  id: string;
  kind: "sales" | "stock" | "catalog" | "site" | "ava_ops" | "market" | "other";
  subject: string;
  text: string;
  metrics?: Record<string, number | string | null>;
  periodLabel?: string;
  storeHint?: string | null;
  source: string;
  observedAt: string;
};

export type BiAnomaly = {
  id: string;
  code: string;
  title: string;
  severity: "low" | "medium" | "high";
  observationIds: string[];
  text: string;
  priority: BiPriorityScore;
};

export type BiHypothesis = {
  id: string;
  anomalyId?: string;
  subject: string;
  statement: string;
  favoring: string[];
  contradicting: string[];
  missingData: string[];
  confidence: BiConfidence;
  status: "open" | "supported" | "weakened" | "rejected";
};

export type BiIdeaVerdict = "RECOMMANDE" | "INTERESSANT" | "EXPERIMENTAL" | "A_EVITER";

export type BiIdea = {
  id: string;
  subject: string;
  title: string;
  description: string;
  hypothesisIds: string[];
  expectedResult: string;
  risks: string[];
  benefits: string[];
  cost: "low" | "medium" | "high";
  complexity: "low" | "medium" | "high";
  marginImpact: "none" | "low" | "medium" | "high";
  stockImpact: "none" | "helps" | "risks_rupture" | "uses_overstock";
  brandFit: "high" | "medium" | "low";
  verdict: BiIdeaVerdict;
  confidence: BiConfidence;
  requiresHumanValidation: boolean;
  sensitiveActions: string[];
};

export type BiCritique = {
  ideaId: string;
  dataSufficient: boolean;
  ignoredRisks: string[];
  betterAlternatives: string[];
  notes: string;
  adjustedVerdict?: BiIdeaVerdict;
};

export type BiMarketSignal = {
  id: string;
  category: "nouveaute" | "tendance" | "fabricant" | "produit" | "opportunite" | "risque" | "catalogue";
  title: string;
  information: string;
  source: string;
  sourceUrl?: string;
  date: string;
  confidence: BiConfidence;
  importProduct: false; // jamais true — pas d'import auto
};

export type BiExperimentStatus = "draft" | "running" | "completed" | "abandoned";

export type BiExperiment = {
  id: string;
  title: string;
  ideaId?: string;
  hypothesis: string;
  durationDays: number;
  baseline: Record<string, number | string>;
  objective: string;
  indicators: string[];
  status: BiExperimentStatus;
  startedAt?: string;
  endedAt?: string;
  result?: {
    metrics: Record<string, number | string>;
    summary: string;
    learning: string;
    correlationOnly: true;
  };
  createdAt: string;
  updatedAt: string;
};

export type BiBusinessMemoryKind =
  | "BUSINESS_FACT"
  | "DECISION"
  | "EXPERIMENT"
  | "RESULT"
  | "LEARNING"
  | "PREFERENCE"
  | "ONGOING_PROJECT"
  | "MARKET_SIGNAL"
  | "CATALOGUE_FACT";

export type BiBusinessMemoryItem = {
  id: string;
  kind: BiBusinessMemoryKind;
  subject: string;
  content: string;
  confidence: BiConfidence;
  status: "active" | "superseded" | "archived";
  createdAt: string;
  updatedAt: string;
  source: string;
};

export type BiTourStop = {
  id: string;
  title: string;
  urgency: "info" | "watch" | "urgent";
  text: string;
  observationIds: string[];
  ideaIds: string[];
};

export type BiDailyTour = {
  generatedAt: string;
  greeting: string;
  stops: BiTourStop[];
  anomalies: BiAnomaly[];
  topIdeas: BiIdea[];
  missingData: string[];
};

export type BiReflectionCard = {
  id: string;
  observation: string;
  hypothesis: string;
  idea: string;
  confidence: BiConfidence;
  proposedAction: string;
  verdict: BiIdeaVerdict;
  updatedAt: string;
};

export type BiAnalysisBundle = {
  observations: BiObservation[];
  anomalies: BiAnomaly[];
  hypotheses: BiHypothesis[];
  ideas: BiIdea[];
  critiques: BiCritique[];
  reflections: BiReflectionCard[];
  tour?: BiDailyTour;
  marketSignals?: BiMarketSignal[];
  missingData: string[];
  generatedAt: string;
};
