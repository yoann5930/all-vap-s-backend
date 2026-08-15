import { normalizeLoose } from "@/lib/ava/normalize-loose";
import { AvaSpeechNormalizer } from "@/lib/ava/speech/ava-speech-normalizer";
import { applyPhoneticCorrections, lookupFlavorCanonical } from "@/lib/ava/speech/phonetic-corrector";
import { detectSpeechLanguage } from "@/lib/ava/speech/language";
import { recordComprehensionPattern } from "@/lib/ava/speech/comprehension-stats";
import { detectAvaStockQuestion } from "@/lib/ava/stock-question";
import type {
  ConfidenceBand,
  SpeechEntity,
  SpeechIntent,
  SpeechUnderstandOptions,
  SpeechUnderstanding,
} from "@/lib/ava/speech/types";

const SHORT_STOP = /^(qui|ou|et|le|la|de|un|une|a|à|the|a)$/i;

function bandMin(a: ConfidenceBand, b: ConfidenceBand): ConfidenceBand {
  const o = { high: 2, medium: 1, low: 0 };
  return o[a] <= o[b] ? a : b;
}

function detectIntent(
  loose: string,
  original: string,
  opts: SpeechUnderstandOptions,
): { intent: SpeechIntent; confidence: ConfidenceBand; contextUsed: string[] } {
  const contextUsed: string[] = [];
  const hasCtx = Boolean(opts.lastQuestion || opts.lastTopic || (opts.lastProposedNames?.length ?? 0));
  if (hasCtx) contextUsed.push("previous_turn");

  const stockQ = detectAvaStockQuestion(original, {
    lastTopic: opts.lastTopic,
    lastStoreHint: opts.lastStoreHint,
    lastProposedNames: opts.lastProposedNames,
  });
  if (stockQ) {
    if (opts.lastTopic === "stock") contextUsed.push("stock_follow_up");
    return { intent: stockQ.intent, confidence: "high", contextUsed };
  }

  const followUp =
    /^(et |and |same |le premier|le deuxieme|le deuxième|l autre|l'autre|celui|celle|plus |moins |the second|the first|comme celui|comme avant)/i.test(
      original.trim(),
    ) ||
    /^(et en |et a |et à |et demain|pareil)/i.test(original.trim());
  if (followUp && hasCtx) {
    return { intent: "FOLLOW_UP", confidence: "high", contextUsed };
  }
  if (followUp && !hasCtx) {
    return { intent: "FOLLOW_UP", confidence: "medium", contextUsed: ["ellipsis_no_context"] };
  }

  if (
    /\b(qui es tu|qui tu es|tu es qui|c est qui|c qui ava|who are you|what are you|comment tu t appelles?|quel est ton nom)\b/.test(
      loose,
    ) || /\bqui tu es\b/.test(loose)
  ) {
    return { intent: "IDENTITY", confidence: "high", contextUsed };
  }

  if (/\b(fidelatoo|ouvre fidelatoo|fidelato)\b/.test(loose)) {
    return { intent: "FIDELATOO", confidence: "high", contextUsed };
  }

  if (/^(all ?vaps?|ol ?vaps?|allvaps|al vaps|all vape)$/.test(loose)) {
    return { intent: "BUSINESS", confidence: "high", contextUsed };
  }

  if (
    /\b(horaires?|ouvert|ouverte|ouverture|fermez|fermer|fermeture|magasin|boutique|adresse|telephone|numero|hautmont|quesnoy|all vap)\b/.test(
      loose,
    ) ||
    /vous etes|etes ou|where are you|what time|open today|\bstore\b|\bclose\b|quelle heure|vous fermez/.test(loose)
  ) {
    return { intent: "BUSINESS", confidence: "high", contextUsed };
  }

  if (
    /\b(menthe|menthes|menthol|menthole|fraise|fruits?|fruite|frais|gourmand|liquide|eliquide|mint|fruity|strawberry|cherche|veux|truc|saveur|gout|ml|sucre|sweet|fort|tranquille|fresh|montre|de bon)\b/.test(
      loose,
    )
  ) {
    return { intent: "PRODUCT", confidence: "high", contextUsed };
  }

  if (
    /\b(why|comment ca se fait|pourquoi le ciel)\b/.test(loose) ||
    /\b(why is the sky blue)\b/.test(loose)
  ) {
    return { intent: "GENERAL", confidence: "high", contextUsed };
  }

  if (SHORT_STOP.test(original.trim()) && !hasCtx) {
    return { intent: "AMBIGUOUS", confidence: "low", contextUsed: ["short_no_context"] };
  }

  if (/^(o mon|omon|au monde|kenoa|kenois|quenois)$/i.test(original.trim()) && !hasCtx) {
    return { intent: "AMBIGUOUS", confidence: "low", contextUsed: ["city_guess"] };
  }

  if (original.trim().split(/\s+/).length <= 2 && hasCtx) {
    return { intent: "FOLLOW_UP", confidence: "medium", contextUsed };
  }

  return { intent: "GENERAL", confidence: "medium", contextUsed };
}

function extractEntities(text: string): SpeechEntity[] {
  const loose = normalizeLoose(text);
  const entities: SpeechEntity[] = [];
  if (/\bhautmont\b/.test(loose)) {
    entities.push({ type: "city", value: "Hautmont", confidence: "high" });
    entities.push({ type: "store", value: "hautmont", confidence: "high" });
  }
  if (/\bquesnoy\b/.test(loose)) {
    entities.push({ type: "city", value: "Le Quesnoy", confidence: "high" });
    entities.push({ type: "store", value: "le-quesnoy", confidence: "high" });
  }
  const flavor = lookupFlavorCanonical(text);
  if (flavor) entities.push({ type: "flavor", value: flavor, confidence: "high" });
  const vol = text.match(/\b(50|100)\s*ml\b/i);
  if (vol) entities.push({ type: "volume", value: `${vol[1]} ml`, confidence: "high" });
  if (/\b(premier|premiere|le 1)\b/.test(loose)) {
    entities.push({ type: "ref", value: "first", confidence: "high" });
  }
  if (/\b(deuxieme|second|le 2)\b/.test(loose)) {
    entities.push({ type: "ref", value: "second", confidence: "high" });
  }
  return entities;
}

function reconstructFollowUp(normalized: string, opts: SpeechUnderstandOptions): string | null {
  const loose = normalizeLoose(normalized);
  const store =
    opts.lastStoreHint === "le-quesnoy"
      ? "Le Quesnoy"
      : opts.lastStoreHint === "hautmont"
        ? "Hautmont"
        : "";

  if (/\bdemain\b/.test(loose) && (opts.lastTopic === "store" || opts.lastTopic === "hours")) {
    return store
      ? `horaires boutique ${store} demain`
      : "horaires boutique demain";
  }
  if (/\bquesnoy\b/.test(loose) && (opts.lastTopic === "store" || opts.lastTopic === "hours")) {
    return "magasin Le Quesnoy horaires";
  }
  if (/\bhautmont\b/.test(loose) && (opts.lastTopic === "store" || opts.lastTopic === "hours")) {
    return "magasin Hautmont horaires";
  }

  const flavorShift = loose.match(/\bet en ([a-z]+)/) || loose.match(/\bsame but ([a-z]+)/);
  if (flavorShift && (opts.lastTopic === "product" || opts.flavorFamily || opts.lastQuestion)) {
    const flavor = lookupFlavorCanonical(flavorShift[1]) || flavorShift[1];
    return `je cherche un e-liquide ${flavor}`;
  }
  if (/^et (en )?(fraise|menthe|mint|strawberry)\b/.test(loose)) {
    const flavor = lookupFlavorCanonical(loose) || loose;
    return `je cherche un e-liquide ${flavor}`;
  }
  return null;
}

function targetedClarification(
  intent: SpeechIntent,
  loose: string,
  raw: string,
): string | null {
  if (/\brouge\b/.test(loose) && !/fruit/.test(loose) && intent === "PRODUCT") {
    return "Tu cherches plutôt un liquide aux fruits rouges ?";
  }
  if (/\bmagasin\b/.test(loose) && /\bmon\b/.test(loose) && !/\bhautmont\b/.test(loose)) {
    return "Tu parles de la boutique de Hautmont ?";
  }
  if (intent === "AMBIGUOUS") {
    return "Je n'ai pas bien entendu la fin. Tu peux me la redire ?";
  }
  if (raw.trim().split(/\s+/).length <= 1 && SHORT_STOP.test(raw.trim())) {
    return "Je n'ai pas bien entendu. Tu peux reformuler ?";
  }
  return null;
}

export function understandUtterance(
  raw: string,
  opts: SpeechUnderstandOptions = {},
): SpeechUnderstanding {
  const started = Date.now();
  const oral = AvaSpeechNormalizer(raw);
  const phonetic = applyPhoneticCorrections(oral.normalized, opts.lastTopic);
  const reconstructedBase = phonetic.text;
  const lang = detectSpeechLanguage(raw);
  const intentInfo = detectIntent(normalizeLoose(reconstructedBase), reconstructedBase, opts);
  const followUpText = reconstructFollowUp(reconstructedBase, opts);
  const reconstructed = followUpText || reconstructedBase;
  const entities = extractEntities(reconstructed);
  const entityConfidence: ConfidenceBand = entities.length
    ? entities.every((e) => e.confidence === "high")
      ? "high"
      : "medium"
    : intentInfo.intent === "IDENTITY" || intentInfo.intent === "GENERAL"
      ? "medium"
      : "low";

  let intentConfidence = intentInfo.confidence;
  if (phonetic.applied.length && intentConfidence === "high") intentConfidence = "medium";

  const overall = bandMin(intentConfidence, lang.confidence);
  let clarificationRequired = false;
  let clarification: string | null = null;
  let rootCause: SpeechUnderstanding["rootCause"] = null;

  if (intentInfo.intent === "AMBIGUOUS" || intentConfidence === "low") {
    clarificationRequired = true;
    clarification = targetedClarification(intentInfo.intent, normalizeLoose(reconstructed), raw);
    rootCause =
      intentInfo.intent === "AMBIGUOUS" ? "INTENT_AMBIGUOUS" : "STT_LOW_CONFIDENCE";
  } else if (
    /\bmagasin\b/.test(normalizeLoose(reconstructed)) &&
    /\bmon\b/.test(normalizeLoose(reconstructed)) &&
    !/\bhautmont\b/.test(normalizeLoose(reconstructed))
  ) {
    clarificationRequired = true;
    clarification = "Tu parles de la boutique de Hautmont ?";
    rootCause = "ENTITY_AMBIGUOUS";
  } else if (/\brouge\b/.test(normalizeLoose(raw)) && !/fruit|fraise|cerise/.test(normalizeLoose(reconstructed)) && intentInfo.intent === "PRODUCT") {
    clarificationRequired = true;
    clarification = "Tu cherches plutôt un liquide aux fruits rouges ?";
    rootCause = "ENTITY_AMBIGUOUS";
  }

  // Ne pas sur-clarifier si HIGH
  if (intentConfidence === "high" && entityConfidence !== "low") {
    if (rootCause !== "ENTITY_AMBIGUOUS") {
      clarificationRequired = false;
      clarification = null;
      rootCause = null;
    }
  }

  const elapsedMs = Date.now() - started;
  const logs = {
    AVA_RAW_TRANSCRIPT: raw,
    AVA_NORMALIZED_TRANSCRIPT: oral.normalized,
    AVA_LANGUAGE: lang.language,
    AVA_CONFIDENCE: overall,
    AVA_SEMANTIC_RECONSTRUCTION: reconstructed,
    AVA_INTENT: intentInfo.intent,
    AVA_INTENT_CONFIDENCE: intentConfidence,
    AVA_CONTEXT_USED: intentInfo.contextUsed.join(",") || "none",
    AVA_CLARIFICATION_REQUIRED: clarificationRequired,
  };

  recordComprehensionPattern({
    pattern: normalizeLoose(reconstructed).slice(0, 80),
    intent: intentInfo.intent,
    outcome: clarificationRequired ? "failure" : "success",
  });

  return {
    raw,
    normalized: oral.normalized,
    reconstructed,
    normalizedForRouter: reconstructed,
    language: lang.language,
    languageConfidence: lang.confidence,
    intent: intentInfo.intent,
    intentConfidence,
    entityConfidence,
    entities,
    contextUsed: intentInfo.contextUsed,
    clarificationRequired,
    clarification,
    rootCause,
    elapsedMs,
    logs,
  };
}

export function emitUnderstandLogs(u: SpeechUnderstanding): void {
  if (process.env.AVA_SPEECH_DEBUG !== "1" && process.env.NODE_ENV === "production") return;
  const safe = {
    ...u.logs,
    AVA_RAW_TRANSCRIPT: u.logs.AVA_RAW_TRANSCRIPT.slice(0, 160),
  };
  console.info("[AVA_UNDERSTAND]", JSON.stringify(safe));
}
