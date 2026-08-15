export type SpeechIntent =
  | "IDENTITY"
  | "BUSINESS"
  | "PRODUCT"
  | "GENERAL"
  | "COMMAND"
  | "FIDELATOO"
  | "LANGUAGE"
  | "FOLLOW_UP"
  | "AMBIGUOUS"
  | "STOCK_SUMMARY"
  | "STOCK_BY_STORE"
  | "STOCK_OUT_OF_STOCK_COUNT"
  | "STOCK_AVAILABLE_COUNT"
  | "PRODUCT_STOCK_DETAIL";

export type ConfidenceBand = "high" | "medium" | "low";

export type SpeechRootCause =
  | "STT_LOW_CONFIDENCE"
  | "STT_PARTIAL"
  | "STT_NO_MATCH"
  | "NORMALIZATION_AMBIGUOUS"
  | "ENTITY_AMBIGUOUS"
  | "INTENT_AMBIGUOUS"
  | "LANGUAGE_AMBIGUOUS"
  | "CONTEXT_MISSING"
  | "LOCAL_LLM_ERROR"
  | null;

export type SpeechLanguage = "fr" | "en";

export type SpeechEntity = {
  type: "flavor" | "city" | "brand" | "volume" | "store" | "ref";
  value: string;
  confidence: ConfidenceBand;
};

export type SpeechUnderstanding = {
  raw: string;
  normalized: string;
  reconstructed: string;
  /** Texte à envoyer au routeur métier (jamais un STT cassé si correction sûre). */
  normalizedForRouter: string;
  language: SpeechLanguage;
  languageConfidence: ConfidenceBand;
  intent: SpeechIntent;
  intentConfidence: ConfidenceBand;
  entityConfidence: ConfidenceBand;
  entities: SpeechEntity[];
  contextUsed: string[];
  clarificationRequired: boolean;
  clarification: string | null;
  rootCause: SpeechRootCause;
  elapsedMs: number;
  logs: {
    AVA_RAW_TRANSCRIPT: string;
    AVA_NORMALIZED_TRANSCRIPT: string;
    AVA_LANGUAGE: SpeechLanguage;
    AVA_CONFIDENCE: ConfidenceBand;
    AVA_SEMANTIC_RECONSTRUCTION: string;
    AVA_INTENT: SpeechIntent;
    AVA_INTENT_CONFIDENCE: ConfidenceBand;
    AVA_CONTEXT_USED: string;
    AVA_CLARIFICATION_REQUIRED: boolean;
  };
};

export type SpeechUnderstandOptions = {
  lastQuestion?: string | null;
  lastTopic?: "store" | "product" | "identity" | "hours" | "stock" | null;
  lastStoreHint?: "hautmont" | "le-quesnoy" | null;
  lastProposedNames?: string[];
  flavorFamily?: string | null;
};
