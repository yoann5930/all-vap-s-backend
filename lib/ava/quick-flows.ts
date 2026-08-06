/**
 * Parcours guidés déclenchés par les actions rapides A.V.A.
 * Une question à la fois — pas de budget, pas de conseil médical, pas de Puff/JNR.
 */

import type { AvaConversationContext } from "@/lib/ai/ava/types";
import {
  AVA_QUICK_ACTIONS,
  type AvaQuickFlowId,
  type AvaQuickIntent,
} from "@/lib/ava/quick-actions";
import { isExcludedBrandOrProduct } from "@/lib/ava/problems-knowledge";

export type AvaQuickFlowState = {
  intent: AvaQuickIntent;
  flow: Exclude<AvaQuickFlowId, null>;
  mode: string;
  step: number;
  answers: Record<string, string>;
};

export type QuickFlowResult = {
  content: string;
  suggestions: string[];
  /** true = continuer le parcours ; false = terminer et laisser le catalogue */
  continueFlow: boolean;
  state: AvaQuickFlowState | null;
  /** Critères catalogues optionnels à la fin */
  catalogHint?: {
    category?: string | null;
    flavorFamily?: string | null;
    flavorTerms?: string[];
    freshness?: "with" | "without" | "any" | null;
  };
};

const MEDICAL_REDIRECT =
  "Je ne peux pas donner de conseil médical. Pour toute question de santé, adressez-vous à un professionnel de santé. Je peux en revanche vous aider à comprendre les formats disponibles en boutique.";

function yesNo(text: string): "yes" | "no" | "unknown" {
  const t = text.toLowerCase();
  if (/\b(oui|ouais|yes|yep|affirmatif|exact|c['’]est ça|je fume)\b/i.test(t)) return "yes";
  if (/\b(non|nan|no|pas du tout|jamais|j['’]ai arr[eê]t[eé])\b/i.test(t)) return "no";
  return "unknown";
}

function nextState(
  prev: AvaQuickFlowState | null,
  intent: AvaQuickIntent,
  step: number,
  answers: Record<string, string>
): AvaQuickFlowState {
  const cfg = AVA_QUICK_ACTIONS[intent];
  return {
    intent,
    flow: cfg.flow as Exclude<AvaQuickFlowId, null>,
    mode: cfg.mode,
    step,
    answers,
  };
}

/** Démarre un parcours à partir du message initial (premier tour). */
export function startQuickFlow(intent: AvaQuickIntent): QuickFlowResult | null {
  if (intent === "OPEN_GENERAL_CHAT") return null;
  const cfg = AVA_QUICK_ACTIONS[intent];
  if (!cfg.flow) return null;

  switch (intent) {
    case "BEGINNER_VAPING":
      return {
        content:
          "Très bien, je vais vous guider simplement. Pour commencer, fumez-vous actuellement des cigarettes classiques ?",
        suggestions: ["Oui, je fume encore", "Non, j’ai arrêté", "Je n’ai jamais fumé"],
        continueFlow: true,
        state: nextState(null, intent, 1, {}),
      };
    case "NICOTINE_GUIDANCE":
      return {
        content:
          "D’accord. Je peux vous aider à vous orienter parmi les taux proposés en boutique — sans avis médical. Fumez-vous encore des cigarettes, ou vapotez-vous déjà ?",
        suggestions: ["Je fume encore", "Je vapote déjà", "Les deux", "Je débute"],
        continueFlow: true,
        state: nextState(null, intent, 1, {}),
      };
    case "FRUIT_FLAVOUR_GUIDANCE":
      return {
        content:
          "Parfait, restons sur du fruité. Vous préférez plutôt un fruit simple, ou un mélange de fruits ?",
        suggestions: ["Fruit simple", "Mélange de fruits", "Je ne sais pas"],
        continueFlow: true,
        state: nextState(null, intent, 1, { theme: "fruit" }),
      };
    case "BEGINNER_DEVICE_GUIDANCE":
      return {
        content:
          "Très bien, je vais vous aider à trouver un matériel adapté pour débuter (hors puff et jetable). Avez-vous déjà vapote, même un peu ?",
        suggestions: ["Pas encore", "Un peu", "Oui, j’ai déjà un matériel"],
        continueFlow: true,
        state: nextState(null, intent, 1, {}),
      };
    default:
      return null;
  }
}

export function continueQuickFlow(
  state: AvaQuickFlowState,
  message: string
): QuickFlowResult {
  const excl = isExcludedBrandOrProduct(message);
  if (excl.excluded) {
    return {
      content:
        excl.reason ||
        "Ce type de produit (Puff / JNR / jetable) n’est pas proposé par A.V.A. On reste sur du matériel rechargeable adapté.",
      suggestions: ["Continuer le parcours", "Autre question"],
      continueFlow: true,
      state,
    };
  }

  if (/m[eé]dical|docteur|m[eé]decin|sant[eé]\s+grave|ordonnance/i.test(message)) {
    return {
      content: MEDICAL_REDIRECT,
      suggestions: ["Continuer", "Voir la boutique"],
      continueFlow: true,
      state,
    };
  }

  switch (state.flow) {
    case "BEGINNER_ONBOARDING":
      return beginnerStep(state, message);
    case "NICOTINE_SELECTION":
      return nicotineStep(state, message);
    case "FRUIT_FLAVOUR_SELECTION":
      return fruitStep(state, message);
    case "BEGINNER_DEVICE_SELECTION":
      return deviceStep(state, message);
    default:
      return {
        content: "Dites-moi comment je peux vous aider.",
        suggestions: ["Je débute la vape", "E-liquide fruité"],
        continueFlow: false,
        state: null,
      };
  }
}

function beginnerStep(state: AvaQuickFlowState, message: string): QuickFlowResult {
  const answers = { ...state.answers };
  const step = state.step;

  if (step === 1) {
    const yn = yesNo(message);
    answers.smokes = yn === "unknown" ? message.slice(0, 80) : yn;
    return {
      content:
        yn === "no" || /jamais/i.test(message)
          ? "Merci. Environ combien de cigarettes fumiez-vous par jour auparavant, si vous vous en souvenez — ou préférez-vous passer cette étape ?"
          : "Merci. Environ combien de cigarettes par jour, approximativement ?",
      suggestions: ["Moins de 5", "Environ 10", "Environ 20", "Plus de 20", "Passer"],
      continueFlow: true,
      state: nextState(state, state.intent, 2, answers),
    };
  }

  if (step === 2) {
    answers.cigsPerDay = message.slice(0, 80);
    return {
      content:
        "À quel moment le besoin est-il le plus fort pour vous : au réveil, après les repas, le soir, ou plutôt tout au long de la journée ?",
      suggestions: ["Au réveil", "Après les repas", "Le soir", "Toute la journée"],
      continueFlow: true,
      state: nextState(state, state.intent, 3, answers),
    };
  }

  if (step === 3) {
    answers.whenStrongest = message.slice(0, 80);
    return {
      content:
        "Pour le tirage : un tirage serré se rapproche d’une cigarette (plus étroit), un tirage plus aérien laisse passer plus d’air et de vapeur. Que préférez-vous ?",
      suggestions: ["Tirage serré", "Plus aérien", "Je ne sais pas"],
      continueFlow: true,
      state: nextState(state, state.intent, 4, answers),
    };
  }

  if (step === 4) {
    answers.draw = message.slice(0, 80);
    return {
      content:
        "Côté format : préférez-vous un matériel compact et discret, ou une autonomie plus importante même si l’appareil est un peu plus grand ?",
      suggestions: ["Compact / discret", "Plus d’autonomie", "Sans préférence"],
      continueFlow: true,
      state: nextState(state, state.intent, 5, answers),
    };
  }

  if (step === 5) {
    answers.format = message.slice(0, 80);
    return {
      content: "Quelles saveurs vous tentent le plus : fruité, frais, gourmand, ou classic / tabac ?",
      suggestions: ["Fruité", "Frais", "Gourmand", "Classic / tabac"],
      continueFlow: true,
      state: nextState(state, state.intent, 6, answers),
    };
  }

  if (step === 6) {
    answers.flavor = message.slice(0, 80);
    return {
      content:
        "Souhaitez-vous aussi une aide pour vous orienter sur le taux de nicotine (information boutique, sans avis médical) ?",
      suggestions: ["Oui, guidez-moi", "Non merci", "Plus tard"],
      continueFlow: true,
      state: nextState(state, state.intent, 7, answers),
    };
  }

  // step >= 7 : clôture progressive
  answers.nicotineHelp = message.slice(0, 80);
  const wantsNic = /oui|guide/i.test(message);
  return {
    content: wantsNic
      ? "Très bien. En boutique, les taux courants vont souvent de 0 à 18 mg selon les formats. Plus vous fumiez, plus les personnes débutantes se tournent parfois vers un taux plus élevé — mais le choix reste personnel et n’est pas un avis médical. Voulez-vous que je vous propose des e-liquides fruités ou un matériel débutant du catalogue ?"
      : "Parfait. Je peux maintenant vous proposer des pistes du catalogue selon vos préférences (hors puff et jetable). Souhaitez-vous plutôt voir des e-liquides, ou un matériel pour débuter ?",
    suggestions: ["E-liquides", "Matériel débutant", "Les deux"],
    continueFlow: false,
    state: null,
    catalogHint: {
      flavorFamily: /fruit/i.test(answers.flavor || "")
        ? "fruite"
        : /frais|menthol/i.test(answers.flavor || "")
          ? "frais"
          : /gourmand/i.test(answers.flavor || "")
            ? "gourmand"
            : /classic|tabac/i.test(answers.flavor || "")
              ? "tabac"
              : "fruite",
      flavorTerms: answers.flavor ? [answers.flavor] : ["fruit"],
      category: /mat[eé]riel/i.test(message) ? "cigarettes-electroniques" : null,
    },
  };
}

function nicotineStep(state: AvaQuickFlowState, message: string): QuickFlowResult {
  const answers = { ...state.answers };
  const step = state.step;

  if (step === 1) {
    answers.status = message.slice(0, 80);
    return {
      content:
        "Merci. Si vous fumiez encore, environ combien de cigarettes par jour ? (Approximation suffisante — ce n’est pas un diagnostic médical.)",
      suggestions: ["Moins de 5", "Environ 10", "Environ 20", "Plus de 20", "Je vapote déjà"],
      continueFlow: true,
      state: nextState(state, state.intent, 2, answers),
    };
  }

  if (step === 2) {
    answers.cigs = message.slice(0, 80);
    return {
      content:
        "Préférez-vous un sels de nicotine (souvent ressenti plus doux) ou une nicotine classique librebase, ou vous n’avez pas de préférence ?",
      suggestions: ["Sels de nicotine", "Librebase", "Sans préférence", "Je ne sais pas"],
      continueFlow: true,
      state: nextState(state, state.intent, 3, answers),
    };
  }

  // Orientation prudente
  answers.salt = message.slice(0, 80);
  let hint =
    "À titre indicatif boutique uniquement : beaucoup de débutants qui fumaient beaucoup regardent souvent des taux plus élevés (ex. 12–18 mg selon formats), tandis qu’une consommation plus faible oriente parfois vers 3–6 mg. ";
  if (/moins de 5|vapote d[eé]j[aà]/i.test(answers.cigs)) {
    hint =
      "À titre indicatif boutique uniquement : avec une faible consommation ou si vous vapotez déjà, des taux plus bas (0–6 mg) sont souvent regardés en premier. ";
  } else if (/20|plus de/i.test(answers.cigs)) {
    hint =
      "À titre indicatif boutique uniquement : avec une consommation élevée de cigarettes, certaines personnes regardent d’abord des taux plus hauts disponibles en boutique. ";
  }

  return {
    content:
      hint +
      "Ce n’est pas un avis médical : en cas de doute (grossesse, pathologie, traitement), demandez conseil à un professionnel de santé. Voulez-vous que je vous montre des e-liquides du catalogue pour comparer les taux affichés ?",
    suggestions: ["Voir des e-liquides", "Autre question", "Parler à la boutique"],
    continueFlow: false,
    state: null,
    catalogHint: { category: "e-liquides", flavorTerms: [] },
  };
}

function fruitStep(state: AvaQuickFlowState, message: string): QuickFlowResult {
  const answers = { ...state.answers };
  const step = state.step;

  if (step === 1) {
    answers.simpleOrMix = message.slice(0, 80);
    return {
      content: "Souhaitez-vous une version fraîche (effet frais / glacé) ou non fraîche ?",
      suggestions: ["Frais", "Non frais", "Les deux me vont"],
      continueFlow: true,
      state: nextState(state, state.intent, 2, answers),
    };
  }

  if (step === 2) {
    answers.fresh = message.slice(0, 80);
    return {
      content: "Plutôt une saveur sucrée, ou plus légère / moins sucrée ?",
      suggestions: ["Sucrée", "Légère", "Sans préférence"],
      continueFlow: true,
      state: nextState(state, state.intent, 3, answers),
    };
  }

  if (step === 3) {
    answers.sweet = message.slice(0, 80);
    return {
      content:
        "Quelle famille vous attire le plus : fruits rouges, agrumes, fruits exotiques, ou pomme / poire / pêche ?",
      suggestions: ["Fruits rouges", "Agrumes", "Exotiques", "Pomme / poire / pêche"],
      continueFlow: true,
      state: nextState(state, state.intent, 4, answers),
    };
  }

  answers.family = message.slice(0, 80);
  let flavorFamily: string = "fruite";
  const flavorTerms: string[] = ["fruit"];
  if (/rouge/i.test(message)) {
    flavorFamily = "fruits_rouges";
    flavorTerms.push("fruits rouges", "fraise");
  } else if (/agrume|citron|orange/i.test(message)) {
    flavorFamily = "agrumes";
    flavorTerms.push("agrume", "citron");
  } else if (/exotique|mangue|passion/i.test(message)) {
    flavorFamily = "exotique";
    flavorTerms.push("mangue", "exotique");
  } else if (/pomme|poire|p[eê]che/i.test(message)) {
    flavorFamily = "fruite";
    flavorTerms.push("pomme", "poire", "pêche");
  }

  const freshness =
    /non\s*frais|pas frais/i.test(answers.fresh || "")
      ? ("without" as const)
      : /frais|glac/i.test(answers.fresh || "")
        ? ("with" as const)
        : ("any" as const);

  return {
    content:
      "Merci. Je regarde dans le catalogue réel des e-liquides fruités qui correspondent — uniquement des références publiables, sans inventer de produit.",
    suggestions: ["Autres fruits", "Moins sucré", "Voir le matériel"],
    continueFlow: false,
    state: null,
    catalogHint: {
      category: "e-liquides",
      flavorFamily,
      flavorTerms,
      freshness,
    },
  };
}

function deviceStep(state: AvaQuickFlowState, message: string): QuickFlowResult {
  const answers = { ...state.answers };
  const step = state.step;

  if (/puff|jnr|jetable|dispos/i.test(message)) {
    return {
      content:
        "Les puffs, JNR et produits jetables sont exclus des recommandations A.V.A. On reste sur du matériel rechargeable. Quelle simplicité recherchez-vous : ultra simple (pod), ou un peu plus de réglages ?",
      suggestions: ["Ultra simple", "Un peu de réglages", "Je ne sais pas"],
      continueFlow: true,
      state: nextState(state, state.intent, Math.max(step, 2), answers),
    };
  }

  if (step === 1) {
    answers.experience = message.slice(0, 80);
    return {
      content:
        "Quelle simplicité recherchez-vous : quelque chose d’ultra simple à prendre en main, ou acceptez-vous quelques réglages ?",
      suggestions: ["Ultra simple", "Quelques réglages", "Sans préférence"],
      continueFlow: true,
      state: nextState(state, state.intent, 2, answers),
    };
  }

  if (step === 2) {
    answers.simplicity = message.slice(0, 80);
    return {
      content: "Priorité autonomie (tenir longtemps) ou format compact / discret ?",
      suggestions: ["Autonomie", "Compact / discret", "Les deux"],
      continueFlow: true,
      state: nextState(state, state.intent, 3, answers),
    };
  }

  if (step === 3) {
    answers.autonomy = message.slice(0, 80);
    return {
      content:
        "Tirage plutôt serré (proche cigarette) ou plus aérien ? Et quel niveau d’entretien vous convient : minimal, ou vous acceptez de changer résistances / remplir régulièrement ?",
      suggestions: ["Serré + entretien minimal", "Aérien", "Entretien OK"],
      continueFlow: true,
      state: nextState(state, state.intent, 4, answers),
    };
  }

  answers.drawCare = message.slice(0, 80);
  return {
    content:
      "Parfait. Je vais chercher dans le catalogue un matériel débutant rechargeable (pas de puff, pas de JNR, pas de jetable), parmi les références réellement publiables.",
    suggestions: ["Voir d’autres kits", "E-liquides adaptés", "Autre question"],
    continueFlow: false,
    state: null,
    catalogHint: {
      category: "cigarettes-electroniques",
      flavorTerms: [],
    },
  };
}

/** Résout l’intent depuis un message utilisateur initial connu. */
export function matchQuickIntentFromMessage(message: string): AvaQuickIntent | null {
  const trimmed = message.trim();
  for (const [intent, cfg] of Object.entries(AVA_QUICK_ACTIONS) as Array<
    [AvaQuickIntent, (typeof AVA_QUICK_ACTIONS)[AvaQuickIntent]]
  >) {
    if (intent === "OPEN_GENERAL_CHAT") continue;
    if (cfg.initialMessage && cfg.initialMessage === trimmed) return intent;
  }
  // Tolérance légère sur formulations proches
  const t = trimmed.toLowerCase();
  if (/d[eé]bute la vape|besoin d['’][eê]tre guid/i.test(t)) return "BEGINNER_VAPING";
  if (/taux de nicotine choisir/i.test(t)) return "NICOTINE_GUIDANCE";
  if (/e-liquide fruit[eé]|meilleurs fruits|fruit[eé].*conseil/i.test(t))
    return "FRUIT_FLAVOUR_GUIDANCE";
  if (/mat[eé]riel.*commencer|mat[eé]riel adapt[eé] pour commencer/i.test(t))
    return "BEGINNER_DEVICE_GUIDANCE";
  return null;
}

export function getQuickFlowFromContext(
  ctx: AvaConversationContext | null | undefined
): AvaQuickFlowState | null {
  const q = ctx?.quickFlow;
  if (!q?.flow || !q?.intent) return null;
  return q as AvaQuickFlowState;
}
