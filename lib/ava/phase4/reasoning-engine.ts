/**
 * Moteur de raisonnement Phase 4 — infrastructure uniquement.
 * Ne conclut jamais sous AVA_CONFIDENCE_THRESHOLD.
 * Ne invente aucune hypothèse hors connaissances VERIFIED fournies.
 */
import {
  AVA_CONFIDENCE_THRESHOLD,
  isAvaPhase4Excluded,
} from "@/lib/ava/phase4/constants";

export type ReasoningSymptomInput = {
  symptomsText: string;
  knownEquipment?: {
    manufacturer?: string;
    model?: string;
    kind?: string;
  } | null;
  clientContext?: Record<string, unknown> | null;
};

export type VerifiedKnowledgeAtom = {
  id: string;
  title: string;
  symptoms: string[];
  solutionHint?: string | null;
  sourceNote?: string | null;
  equipmentLabel?: string | null;
};

export type ReasoningHypothesis = {
  id: string;
  title: string;
  confidence: number;
  matchedSymptoms: string[];
  explanation: string;
  solutionHint: string | null;
  sourceNote: string | null;
};

export type ReasoningResult = {
  excluded: boolean;
  exclusionReason: string | null;
  hypotheses: ReasoningHypothesis[];
  topConfidence: number;
  needsMoreInfo: boolean;
  explanation: string;
  complementaryAsk: string | null;
  belowThreshold: boolean;
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenOverlap(a: string, b: string): string[] {
  const ta = new Set(normalize(a).split(" ").filter((t) => t.length > 2));
  const tb = normalize(b).split(" ").filter((t) => t.length > 2);
  return tb.filter((t) => ta.has(t));
}

/**
 * Analyse symptômes + contexte contre une liste de connaissances déjà VERIFIED.
 * Si la liste est vide → aucune hypothèse (jamais inventée).
 */
export function runReasoningEngine(
  input: ReasoningSymptomInput,
  verifiedKnowledge: VerifiedKnowledgeAtom[],
): ReasoningResult {
  const blob = [
    input.symptomsText,
    input.knownEquipment?.manufacturer,
    input.knownEquipment?.model,
    input.knownEquipment?.kind,
  ]
    .filter(Boolean)
    .join(" ");

  const excl = isAvaPhase4Excluded(blob);
  if (excl.excluded) {
    return {
      excluded: true,
      exclusionReason: excl.reason,
      hypotheses: [],
      topConfidence: 0,
      needsMoreInfo: false,
      explanation: excl.reason || "Produit exclu du diagnostic A.V.A.",
      complementaryAsk: null,
      belowThreshold: true,
    };
  }

  const symptoms = normalize(input.symptomsText);
  if (!symptoms || symptoms.length < 3) {
    return {
      excluded: false,
      exclusionReason: null,
      hypotheses: [],
      topConfidence: 0,
      needsMoreInfo: true,
      explanation:
        "Informations insuffisantes. Aucune hypothèse ne peut être formulée sans symptômes décrits.",
      complementaryAsk:
        "Pouvez-vous décrire le matériel (marque, modèle), le symptôme exact et depuis quand il apparaît ?",
      belowThreshold: true,
    };
  }

  if (!verifiedKnowledge.length) {
    return {
      excluded: false,
      exclusionReason: null,
      hypotheses: [],
      topConfidence: 0,
      needsMoreInfo: true,
      explanation:
        "Aucune fiche métier VERIFIED n'est disponible pour raisonner. Orientation SAV boutique si besoin.",
      complementaryAsk:
        "Indiquez marque et modèle exacts ; un conseiller boutique pourra compléter si la base métier n'est pas encore validée.",
      belowThreshold: true,
    };
  }

  const scored: ReasoningHypothesis[] = [];

  for (const atom of verifiedKnowledge) {
    const matched = new Set<string>();
    for (const s of atom.symptoms) {
      for (const m of tokenOverlap(symptoms, s)) matched.add(m);
      if (normalize(symptoms).includes(normalize(s)) && normalize(s).length > 3) {
        matched.add(normalize(s));
      }
    }
    const matchCount = matched.size;
    if (matchCount === 0) continue;

    const denom = Math.max(atom.symptoms.length, 1);
    let confidence = Math.min(0.95, matchCount / denom);
    if (input.knownEquipment?.model && atom.equipmentLabel) {
      const eq = normalize(atom.equipmentLabel);
      const model = normalize(input.knownEquipment.model);
      if (eq.includes(model) || model.includes(eq.split(" ").pop() || "")) {
        confidence = Math.min(0.98, confidence + 0.1);
      }
    }

    scored.push({
      id: atom.id,
      title: atom.title,
      confidence: Math.round(confidence * 1000) / 1000,
      matchedSymptoms: [...matched],
      explanation: `Correspondance sur ${matchCount} indice(s) symptôme(s) issus d'une fiche VERIFIED.`,
      solutionHint: atom.solutionHint ?? null,
      sourceNote: atom.sourceNote ?? null,
    });
  }

  scored.sort((a, b) => b.confidence - a.confidence);
  const top = scored[0]?.confidence ?? 0;
  const belowThreshold = top < AVA_CONFIDENCE_THRESHOLD;
  const needsMoreInfo = belowThreshold || scored.length === 0;

  let complementaryAsk: string | null = null;
  if (needsMoreInfo) {
    complementaryAsk =
      "Pour affiner : le matériel chauffe-t-il ? Affiche-t-il un message d'erreur ? Avez-vous changé résistance/cartouche récemment ?";
  }

  const explanation =
    scored.length === 0
      ? "Aucun motif VERIFIED ne correspond aux symptômes. Pas de diagnostic inventé."
      : belowThreshold
        ? `Hypothèses classées disponibles, mais confiance max ${(top * 100).toFixed(0)} % < ${AVA_CONFIDENCE_THRESHOLD * 100} % — informations complémentaires requises.`
        : `Hypothèse principale à ${(top * 100).toFixed(0)} % de confiance, basée uniquement sur des fiches VERIFIED.`;

  return {
    excluded: false,
    exclusionReason: null,
    hypotheses: scored.slice(0, 5),
    topConfidence: top,
    needsMoreInfo,
    explanation,
    complementaryAsk,
    belowThreshold,
  };
}

export { AVA_CONFIDENCE_THRESHOLD };
