/**
 * Garde-fous nicotine / situations respiratoires A.V.A.
 * Source : data/ava/formation-nicotine-respiratoire (2026-08-14).
 * Prioritaires par rapport à la vente. Ne diagnostiquent pas.
 */
import rules from "@/data/ava/formation-nicotine-respiratoire/ava_engine/ava_regles_respiratoires.json";
import { normalizeLoose } from "@/lib/ava/normalize-loose";

export type RespiratoryLevel =
  | "red"
  | "orange"
  | "sensitive_pregnancy"
  | "sensitive_oxygen"
  | "never_smoker"
  | "treatment_modification"
  | "essential_oils"
  | "medical_claim"
  | "nicotine_not_from_disease"
  | "over_supply"
  | "human_escalation";

export type RespiratoryGuardrailResult = {
  level: RespiratoryLevel;
  content: string;
  suggestions: string[];
  /** Urgence : stop commercial. */
  blocked?: boolean;
  /** Empêche la reformulation OpenAI. */
  safetyLocked: true;
  /** Enchaîner sur le bilan nicotine (dépendance tabac, pas la maladie). */
  startNicotineFlow?: boolean;
};

export type RespiratoryGuardrailContext = {
  inNicotineFlow?: boolean;
  inBeginnerFlow?: boolean;
  inDiagnostic?: boolean;
};

const CONTACTS = rules.allvaps_contacts;

export const ALLVAPS_HUMAN_ESCALATION =
  `Vous pouvez passer chez All Vap's Hautmont au ${CONTACTS.hautmont.address} ou appeler le ${CONTACTS.hautmont.phone}. ` +
  `Vous pouvez aussi contacter All Vap's Le Quesnoy, ${CONTACTS.le_quesnoy.address}, au ${CONTACTS.le_quesnoy.phone}, ` +
  `ou nous écrire à ${CONTACTS.email}. L'équipe pourra vérifier votre matériel et votre utilisation avec vous.`;

const RED_REPLY =
  "Ce que vous décrivez peut nécessiter une prise en charge urgente. Je ne vais pas essayer de corriger cela avec un réglage de cigarette électronique ou un changement de nicotine.";

const ORANGE_REPLY =
  "Je ne vais pas chercher à compenser ce symptôme avec un liquide, une puissance ou un taux de nicotine. " +
  "Une gêne respiratoire nouvelle, persistante ou qui change par rapport à l'habitude doit d'abord être évaluée. " +
  "Pour la partie vape, notre équipe All Vap's peut reprendre le conseil avec vous une fois la situation clarifiée. " +
  ALLVAPS_HUMAN_ESCALATION;

const ASTHMA_RATE_REPLY =
  "L'asthme ne donne pas directement un taux de nicotine. Pour choisir le dosage, je vais plutôt regarder votre dépendance au tabac, votre consommation actuelle et votre matériel. " +
  "Si la situation est difficile à évaluer à distance, notre équipe All Vap's peut reprendre le conseil avec vous en boutique ou par téléphone.";

const COUGH_RATE_REPLY =
  "La toux ne permet pas à elle seule de choisir un taux de nicotine. Pour votre dosage, je peux plutôt regarder votre consommation de cigarettes, votre taux actuel, votre matériel et si vous avez encore envie de fumer. Si vous voulez, on peut faire ce bilan ensemble.";

const UNCERTAIN_REPLY =
  "Je préfère que l'on affine cela correctement plutôt que de vous donner un dosage au hasard. " + ALLVAPS_HUMAN_ESCALATION;

const NEVER_SMOKER_REPLY =
  "Je ne peux pas vous encourager à commencer la vape si vous ne fumez pas. Les produits nicotinés sont réservés aux fumeurs adultes qui cherchent une alternative au tabac. Si vous avez une question pratique pour un proche, notre équipe All Vap's peut vous renseigner en boutique.";

const PREGNANCY_REPLY =
  "Je ne peux pas conseiller un e-liquide ou un taux comme s'il était plus adapté pendant la grossesse. Le plus prudent est d'en parler avec un professionnel de santé pour une stratégie de sevrage. Notre équipe All Vap's reste disponible pour un conseil vape strictement commercial, sans promesse santé.";

const OXYGEN_REPLY =
  "Dans cette situation, je ne fais aucune recommandation de vapotage. Le suivi appartient à l'équipe médicale qui vous accompagne. Notre boutique peut seulement répondre à des questions pratiques générales, sans régler un matériel comme un traitement.";

const TREATMENT_REPLY =
  "Je ne peux pas vous conseiller de diminuer, d'arrêter ou de remplacer un traitement médical parce que vous vapotez. Cela appartient à votre prescripteur. Je reste disponible pour la partie strictement technique du matériel, une fois la situation médicale clarifiée.";

const ESSENTIAL_OILS_REPLY =
  "Je ne peux pas conseiller d'ajouter une huile essentielle ou une substance non prévue dans un réservoir. Cela n'est pas un usage du matériel. Restez sur des e-liquides conçus pour la cigarette électronique.";

const MEDICAL_CLAIM_REPLY =
  "Un coil, un liquide, une puissance ou un taux de nicotine ne soignent pas les poumons et ne sont pas un traitement. Je peux vous aider sur le matériel et le dosage selon votre consommation de tabac, sans promesse santé.";

const OVER_SUPPLY_REPLY =
  "Je ne vais pas conclure uniquement à partir de ce symptôme. Dites-moi votre taux, votre matériel et à quelle fréquence vous vapotez. Je vais vérifier si votre utilisation justifie plutôt de revoir le dosage ou de faire contrôler l'ensemble en boutique. " +
  ALLVAPS_HUMAN_ESCALATION;

function has(n: string, re: RegExp): boolean {
  return re.test(n);
}

function isRed(n: string): boolean {
  if (/\blevres?\b/.test(n) && /\bbleues?\b/.test(n)) return true;
  if (/\bconfusion\b/.test(n) && /\b(respir|air|malaise|connaissance|evanoui|thoracique|poitrine)\b/.test(n)) {
    return true;
  }
  return has(
    n,
    /\b((ne|n) (peux|peut|arrive) (plus )?(a )?(respirer|parler)|difficulte (a |de )(respirer|parler)|essoufflement (brutal|severe|important|violent)|cyanose|perte de connaissance|evanoui|evanouissement|douleur (dans la )?poitrine|douleur thoracique|crise d asthme|traitement de secours|ventoline (ne )?(suffit|marche) pas)\b/,
  );
}

function isWorsening(n: string): boolean {
  return has(
    n,
    /\b(aggrav|plus fort|plus frequente?s?|pas comme d habitude|inhabituel|moins efficace|ca change|etat (change|different))\b/,
  );
}

function hasAsthmaCopd(n: string): boolean {
  return has(n, /\b(asthme|asthmatique|bpco|bronchite chronique)\b/);
}

function hasRespiratorySymptom(n: string): boolean {
  return has(n, /\b(toux|touss(e|er|euse)?|essouffl|sifflement|sifflante|oppression|gene respiratoire|mal a respirer|probleme respiratoire|souci respiratoire)\b/);
}

function isPersistent(n: string): boolean {
  return has(
    n,
    /\b(depuis .*(jour|semaine|mois)|trois semaines|2 jours|deux jours|plusieurs jours|ca persiste|qui persiste)\b/,
  );
}

function isOrange(n: string): boolean {
  if (hasAsthmaCopd(n) && isWorsening(n)) return true;
  if (hasAsthmaCopd(n) && hasRespiratorySymptom(n) && isWorsening(n)) return true;
  if (hasRespiratorySymptom(n) && has(n, /\bfievre\b/)) return true;
  if (hasRespiratorySymptom(n) && isPersistent(n)) return true;
  if (hasRespiratorySymptom(n) && has(n, /\b(chaque (fois|session)|a chaque vapot)/)) return true;
  if (has(n, /\b(reveil(le)? la nuit|me reveille)\b/) && hasRespiratorySymptom(n)) return true;
  return false;
}

function isGreenTechnical(n: string): boolean {
  if (!hasRespiratorySymptom(n)) return false;
  return has(
    n,
    /\b(resistance|coil|gout de brule|brulee?|puissance|watt|amorcage|plage constructeur|au dessus de la plage|fuite|surchauffe)\b/,
  );
}

function asksNicotineRate(n: string): boolean {
  return has(
    n,
    /\b(taux|nicotine|mg ?\/? ?ml|augmenter (la )?nicotine|diminuer (la )?nicotine|quel dosage|que dois je prendre|me conseillerais|me conseilles|conseiller|quel liquide)\b/,
  );
}

function isHumanEscalation(n: string): boolean {
  return has(
    n,
    /\b(parler (a |avec )?(quelqu un|un conseiller|l equipe|l equipe all|vous en boutique)|voir quelqu un|passer (en |a la )boutique|appeler (la boutique|hautmont|le quesnoy|all vap)|coordonnees|votre telephone|votre e?mail|contact@allvaps|plutot en boutique)\b/,
  );
}

function wantsToStart(n: string): boolean {
  return has(n, /\b(essayer|debuter|commencer|curieux|envie d essayer|je voudrais vapoter)\b/);
}

function isPregnancy(n: string): boolean {
  return has(n, /\b(enceinte|grossesse|femme enceinte)\b/);
}

function isOxygen(n: string): boolean {
  return has(n, /\b(oxygene|oxygenotherapie|sous o2|sous oxygene)\b/);
}

function isTreatmentModification(n: string): boolean {
  return (
    has(n, /\b(diminuer|arreter|reduire|remplacer)\b/) &&
    has(n, /\b(traitement|ventoline|corticoide|cortisone|inhalateur|medicament)\b/)
  );
}

function isEssentialOils(n: string): boolean {
  return has(n, /\bhuile essentielle\b/);
}

function isMedicalClaim(n: string): boolean {
  const claim = has(
    n,
    /\b(soigne|guerit|nettoie les poumons|bon pour l asthme|sans danger pour les poumons|vapeur d eau|c est sans risque|protege les poumons)\b/,
  );
  if (!claim) return false;
  return has(n, /\b(vape|vapote|liquide|coil|resistance|nicotine|poumon|asthme|pg|vg|cigarette electronique)\b/);
}

function isOverSupply(n: string): boolean {
  return (
    has(n, /\b(nausee|nausees|vertige|vertiges|mal de tete|maux de tete|palpitation|malaise)\b/) &&
    has(n, /\b(vape|vapote|nicotine|apres (avoir )?vapote)\b/)
  );
}

export function evaluateRespiratoryGuardrail(
  message: string,
  ctx: RespiratoryGuardrailContext = {},
): RespiratoryGuardrailResult | null {
  const n = normalizeLoose(message);
  if (n.length < 4) return null;

  if (isRed(n)) {
    return {
      level: "red",
      content: RED_REPLY,
      suggestions: [],
      blocked: true,
      safetyLocked: true,
    };
  }

  if (isOxygen(n)) {
    return {
      level: "sensitive_oxygen",
      content: OXYGEN_REPLY,
      suggestions: ["Nos magasins", "Autre question"],
      safetyLocked: true,
    };
  }

  if (isPregnancy(n)) {
    return {
      level: "sensitive_pregnancy",
      content: PREGNANCY_REPLY,
      suggestions: ["Nos magasins", "Autre question"],
      safetyLocked: true,
    };
  }

  if (isTreatmentModification(n)) {
    return {
      level: "treatment_modification",
      content: TREATMENT_REPLY,
      suggestions: ["Nos magasins", "Autre question"],
      safetyLocked: true,
    };
  }

  if (isEssentialOils(n)) {
    return {
      level: "essential_oils",
      content: ESSENTIAL_OILS_REPLY,
      suggestions: ["E-liquide fruité", "Nos magasins"],
      safetyLocked: true,
    };
  }

  if (isMedicalClaim(n)) {
    return {
      level: "medical_claim",
      content: MEDICAL_CLAIM_REPLY,
      suggestions: ["Quel taux de nicotine choisir ?", "Nos magasins"],
      safetyLocked: true,
    };
  }

  if (isOrange(n)) {
    return {
      level: "orange",
      content: ORANGE_REPLY,
      suggestions: ["Nos magasins", "Appeler Hautmont", "Appeler Le Quesnoy"],
      safetyLocked: true,
    };
  }

  const neverSmokerStart =
    has(n, /\b(jamais fume|non[- ]?fumeur)\b/) || (has(n, /\bje ne fume pas\b/) && wantsToStart(n));
  if (neverSmokerStart && (!ctx.inNicotineFlow || wantsToStart(n) || ctx.inBeginnerFlow)) {
    return {
      level: "never_smoker",
      content: NEVER_SMOKER_REPLY,
      suggestions: ["Nos magasins", "Autre question"],
      safetyLocked: true,
    };
  }

  if (isOverSupply(n) && !isRed(n)) {
    return {
      level: "over_supply",
      content: OVER_SUPPLY_REPLY,
      suggestions: ["Parler à la boutique", "Continuer le bilan nicotine"],
      safetyLocked: true,
    };
  }

  if (isHumanEscalation(n)) {
    return {
      level: "human_escalation",
      content:
        "Bien sûr. Notre équipe All Vap's peut reprendre le conseil avec vous en boutique ou par téléphone. " +
        ALLVAPS_HUMAN_ESCALATION,
      suggestions: ["All Vap's Hautmont", "All Vap's Le Quesnoy", "Autre question"],
      safetyLocked: true,
    };
  }

  const diseaseRate = asksNicotineRate(n) && (hasAsthmaCopd(n) || hasRespiratorySymptom(n));
  if (diseaseRate && !ctx.inNicotineFlow) {
    const coughOnly = hasRespiratorySymptom(n) && !hasAsthmaCopd(n);
    return {
      level: "nicotine_not_from_disease",
      content: coughOnly ? COUGH_RATE_REPLY : ASTHMA_RATE_REPLY,
      suggestions: ["Je fume encore", "Je vapote déjà", "Parler à la boutique"],
      safetyLocked: true,
      startNicotineFlow: true,
    };
  }

  if (ctx.inDiagnostic && isGreenTechnical(n)) return null;
  if (isGreenTechnical(n) && !isOrange(n) && !isRed(n)) return null;

  return null;
}

export function allvapsUncertainNicotineReply(): string {
  return UNCERTAIN_REPLY;
}

export function getRespiratoryRulesVersion(): string {
  return `${rules.version} (${rules.date})`;
}
