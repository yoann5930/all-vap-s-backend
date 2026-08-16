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
import {
  continueNicotineDialogue,
  startNicotineDialogue,
  type NicotineInterviewState,
} from "@/lib/nicotine";
import {
  isDeviceRecommendationIntent,
  parseCigarettesPerDay,
  detectAllDayNeed,
  beginnerHasEnoughForFirstDevice,
  isFlavorTooEarly,
  isFlavorIndecision,
} from "@/lib/ava/advisor-policy";
import { beginnerNicotineOrientation } from "@/lib/ava/beginner-nicotine-speak";

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
    limit?: number;
  };
  persistHints?: {
    cigarettesPerDay?: number;
    allDayNeed?: boolean;
    status?: "debutant";
    advisedNicotineMg?: number;
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
export function startQuickFlow(intent: AvaQuickIntent, message = ""): QuickFlowResult | null {
  if (intent === "OPEN_GENERAL_CHAT") return null;
  const cfg = AVA_QUICK_ACTIONS[intent];
  if (!cfg.flow) return null;

  if (intent === "BEGINNER_VAPING" || intent === "BEGINNER_DEVICE_GUIDANCE") {
    const seed = absorbBeginnerFacts({}, message);
    if (beginnerHasEnoughForFirstDevice(seed) || (isDeviceRecommendationIntent(message) && seed.cigsPerDay)) {
      return finishBeginnerWithDevices(
        nextState(null, intent, 1, seed),
        seed,
      );
    }
    if (seed.cigsPerDay) {
      return {
        content: "Vous en avez besoin plutôt toute la journée, ou surtout à certains moments ?",
        suggestions: ["Toute la journée", "Surtout à certains moments"],
        continueFlow: true,
        state: nextState(null, intent, 3, seed),
      };
    }
    return {
      content:
        intent === "BEGINNER_DEVICE_GUIDANCE"
          ? "Très bien, je vais vous trouver un matériel simple pour commencer. Environ combien de cigarettes fumez-vous par jour ?"
          : "Aucun souci, je vais vous guider simplement. Environ combien de cigarettes fumez-vous par jour ?",
      suggestions: ["Moins de 5", "Environ 10", "Environ 20", "Plus de 20"],
      continueFlow: true,
      state: nextState(null, intent, 2, seed),
    };
  }

  switch (intent) {
    case "BEGINNER_VAPING":
      return {
        content:
          "Aucun souci, je vais vous guider simplement. Environ combien de cigarettes fumez-vous par jour ?",
        suggestions: ["Moins de 5", "Environ 10", "Environ 20", "Plus de 20"],
        continueFlow: true,
        state: nextState(null, intent, 2, {}),
      };
    case "NICOTINE_GUIDANCE": {
      const started = startNicotineDialogue();
      return {
        content: started.spoken,
        suggestions: started.suggestions,
        continueFlow: !started.done,
        state: nextState(null, intent, 1, encodeInterview(started.interview)),
      };
    }
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
          "Très bien. Environ combien de cigarettes fumez-vous par jour ?",
        suggestions: ["Moins de 5", "Environ 10", "Environ 20", "Plus de 20"],
        continueFlow: true,
        state: nextState(null, intent, 2, { smokes: "yes" }),
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

  if (
    isFlavorTooEarly(message) &&
    state.flow !== "FRUIT_FLAVOUR_SELECTION" &&
    state.flow !== "BEGINNER_ONBOARDING" &&
    state.flow !== "BEGINNER_DEVICE_SELECTION"
  ) {
    return startFlavorOrientation();
  }

  if (
    (state.flow === "BEGINNER_ONBOARDING" || state.flow === "BEGINNER_DEVICE_SELECTION") &&
    (isDeviceRecommendationIntent(message) || beginnerHasEnoughForFirstDevice(absorbBeginnerFacts(state.answers, message)))
  ) {
    const merged = absorbBeginnerFacts(state.answers, message);
    if (beginnerHasEnoughForFirstDevice(merged) || (isDeviceRecommendationIntent(message) && merged.cigsPerDay)) {
      return finishBeginnerWithDevices(state, merged);
    }
  }

  switch (state.flow) {
    case "BEGINNER_ONBOARDING":
      return beginnerStep(state, message);
    case "NICOTINE_SELECTION":
      return nicotineStep(state, message);
    case "FRUIT_FLAVOUR_SELECTION":
      return fruitStep(state, message);
    case "BEGINNER_DEVICE_SELECTION":
      return beginnerStep(state, message);
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
  const answers = absorbBeginnerFacts({ ...state.answers }, message);
  const step = state.step;

  if (isDeviceRecommendationIntent(message) && answers.cigsPerDay) {
    return finishBeginnerWithDevices(state, answers);
  }

  if (beginnerHasEnoughForFirstDevice(answers)) {
    return finishBeginnerWithDevices(state, answers);
  }

  if (step === 1) {
    const yn = yesNo(message);
    answers.smokes = yn === "unknown" ? message.slice(0, 80) : yn;
    if (answers.cigsPerDay) {
      return {
        content:
          "Vous en avez besoin plutôt toute la journée, ou surtout à certains moments ?",
        suggestions: ["Toute la journée", "Surtout à certains moments"],
        continueFlow: true,
        state: nextState(state, state.intent, 3, answers),
      };
    }
    return {
      content: "Environ combien de cigarettes par jour, à peu près ?",
      suggestions: ["Moins de 5", "Environ 10", "Environ 20", "Plus de 20"],
      continueFlow: true,
      state: nextState(state, state.intent, 2, answers),
    };
  }

  if (step === 2) {
    if (!answers.cigsPerDay) answers.cigsPerDay = message.slice(0, 80);
    if (beginnerHasEnoughForFirstDevice(answers) || (isDeviceRecommendationIntent(message) && answers.cigsPerDay)) {
      return finishBeginnerWithDevices(state, answers);
    }
    if (answers.cigsPerDay && parseCigarettesPerDay(answers.cigsPerDay) == null && !/^\d+$/.test(answers.cigsPerDay)) {
      const parsed = parseCigarettesPerDay(message);
      if (parsed == null) {
        return {
          content: "Environ combien de cigarettes par jour, à peu près ?",
          suggestions: ["Moins de 5", "Environ 10", "Environ 20", "Plus de 20"],
          continueFlow: true,
          state: nextState(state, state.intent, 2, { ...answers, cigsPerDay: "" }),
        };
      }
      answers.cigsPerDay = String(parsed);
    }
    return {
      content:
        "Vous en avez besoin plutôt toute la journée, ou surtout à certains moments ?",
      suggestions: ["Toute la journée", "Surtout à certains moments"],
      continueFlow: true,
      state: nextState(state, state.intent, 3, answers),
    };
  }

  if (step >= 3) {
    if (answers.allDay == null && detectAllDayNeed(message) != null) {
      answers.allDay = detectAllDayNeed(message) ? "yes" : "no";
    }
    if (
      /tube/i.test(message) &&
      detectAllDayNeed(message) == null &&
      !isDeviceRecommendationIntent(message)
    ) {
      answers.cigaretteType = "tubes";
      return {
        content:
          "Vous en avez besoin plutôt toute la journée, ou surtout à certains moments ?",
        suggestions: ["Toute la journée", "Surtout à certains moments"],
        continueFlow: true,
        state: nextState(state, state.intent, 3, answers),
      };
    }
    if (detectAllDayNeed(message) != null) {
      answers.whenStrongest = message.slice(0, 80);
    }
    if (beginnerHasEnoughForFirstDevice(answers) || (isDeviceRecommendationIntent(message) && answers.cigsPerDay)) {
      return finishBeginnerWithDevices(state, answers);
    }
    return {
      content:
        "Vous en avez besoin plutôt toute la journée, ou surtout à certains moments ?",
      suggestions: ["Toute la journée", "Surtout à certains moments"],
      continueFlow: true,
      state: nextState(state, state.intent, 3, answers),
    };
  }

  return finishBeginnerWithDevices(state, answers);
}

function absorbBeginnerFacts(
  answers: Record<string, string>,
  message: string,
): Record<string, string> {
  const next = { ...answers };
  const cigs = parseCigarettesPerDay(message);
  if (cigs != null) next.cigsPerDay = String(cigs);
  const allDay = detectAllDayNeed(message);
  if (allDay != null) next.allDay = allDay ? "yes" : "no";
  if (/tube/i.test(message)) next.cigaretteType = "tubes";
  return next;
}

function finishBeginnerWithDevices(
  state: AvaQuickFlowState,
  answers: Record<string, string>,
): QuickFlowResult {
  const parsed =
    parseCigarettesPerDay(answers.cigsPerDay || "") ??
    (/^\d+$/.test(answers.cigsPerDay || "") ? Number(answers.cigsPerDay) : null);
  const cigs = parsed != null && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  const allDay = answers.allDay === "yes" || detectAllDayNeed(answers.whenStrongest || "") === true;
  const nic = cigs
    ? beginnerNicotineOrientation({
        cigarettesPerDay: cigs,
        allDayNeed: allDay,
        deviceKind: "pod",
      })
    : { spoken: "", recommendation: null };
  const nicLine = nic.spoken ? ` ${nic.spoken}` : "";
  return {
    content:
      `D'accord. Avec ce que vous m'avez déjà expliqué, je peux vous orienter.${nicLine} Pour le liquide, on s'en occupe juste après, une fois votre matériel choisi.`,
    suggestions: ["Voir le matériel", "Ajuster plus tard", "Question sur l'utilisation"],
    continueFlow: false,
    state: null,
    catalogHint: {
      category: "cigarettes-electroniques",
      flavorTerms: [],
      limit: 3,
    },
    persistHints: {
      cigarettesPerDay: cigs ?? undefined,
      allDayNeed:
        answers.allDay === "yes" ? true : answers.allDay === "no" ? false : allDay ? true : undefined,
      status: "debutant",
      advisedNicotineMg: nic.recommendation?.recommendedRange[0],
    },
  };
}

function nicotineStep(state: AvaQuickFlowState, message: string): QuickFlowResult {
  const prev = decodeInterview(state.answers);
  const turn = continueNicotineDialogue(prev, message);
  if (!turn.done) {
    return {
      content: turn.spoken,
      suggestions: turn.suggestions,
      continueFlow: true,
      state: nextState(state, state.intent, state.step + 1, encodeInterview(turn.interview)),
    };
  }
  return {
    content: turn.spoken,
    suggestions: turn.suggestions,
    continueFlow: false,
    state: null,
  };
}

function encodeInterview(interview: NicotineInterviewState | null): Record<string, string> {
  return { interview: interview ? JSON.stringify(interview) : "" };
}

function decodeInterview(answers: Record<string, string>): NicotineInterviewState | null {
  const raw = answers.interview;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as NicotineInterviewState;
  } catch {
    return null;
  }
}

export function startFlavorOrientation(): QuickFlowResult {
  return {
    content:
      "Aucun souci. Vous préférez essayer quelque chose qui rappelle plutôt la cigarette, ou quelque chose de complètement différent ?",
    suggestions: ["Plus proche d'une cigarette", "Quelque chose de différent", "Je ne sais pas"],
    continueFlow: true,
    state: nextState(null, "FRUIT_FLAVOUR_GUIDANCE", 0, { flavorGate: "await" }),
  };
}

function fruitStep(state: AvaQuickFlowState, message: string): QuickFlowResult {
  const answers = { ...state.answers };
  const step = state.step;

  if (answers.flavorGate === "await" || step === 0) {
    if (isFlavorIndecision(message)) {
      return {
        content:
          "Dans ce cas, je vais vous proposer deux options simples pour commencer, et vous me dites celle qui vous attire le plus.",
        suggestions: ["Plus proche d'une cigarette", "Quelque chose de différent"],
        continueFlow: false,
        state: null,
        catalogHint: {
          category: "e-liquides",
          flavorFamily: "tabac",
          flavorTerms: ["tabac", "fruit"],
          limit: 2,
        },
      };
    }
    const tabac = /cigarette|tabac|classic|blond/i.test(message);
    return {
      content: tabac
        ? "Très bien. Je vous montre quelques classiques, sans noyer le choix."
        : "Très bien. On reste sur une petite sélection, sans liste interminable.",
      suggestions: ["Autre saveur", "Voir le matériel"],
      continueFlow: false,
      state: null,
      catalogHint: {
        category: "e-liquides",
        flavorFamily: tabac ? "tabac" : "fruite",
        flavorTerms: tabac ? ["tabac"] : ["fruit"],
        limit: 3,
      },
    };
  }

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
    if (isDeviceRecommendationIntent(message) || /pas encore|jamais|debut/i.test(message)) {
      return {
        content:
          "Très bien. Je cherche un matériel simple à prendre en main, rechargeable, qui tient bien la journée si besoin — sans vous demander des réglages techniques.",
        suggestions: ["Voir d’autres kits", "E-liquides adaptés", "Autre question"],
        continueFlow: false,
        state: null,
        catalogHint: {
          category: "cigarettes-electroniques",
          flavorTerms: [],
          limit: 3,
        },
      };
    }
    return {
      content: "Vous cherchez surtout quelque chose de simple à utiliser au quotidien ?",
      suggestions: ["Oui, le plus simple", "Je me débrouille un peu", "Sans préférence"],
      continueFlow: true,
      state: nextState(state, state.intent, 2, answers),
    };
  }

  if (step === 2) {
    answers.simplicity = message.slice(0, 80);
    return {
      content:
        "Parfait. Je vais chercher un matériel simple à prendre en main pour commencer.",
      suggestions: ["Voir d’autres kits", "E-liquides adaptés", "Autre question"],
      continueFlow: false,
      state: null,
      catalogHint: {
        category: "cigarettes-electroniques",
        flavorTerms: [],
        limit: 3,
      },
    };
  }

  answers.drawCare = message.slice(0, 80);
  return {
    content:
      "Parfait. Je vais chercher un matériel simple à prendre en main pour commencer.",
    suggestions: ["Voir d’autres kits", "E-liquides adaptés", "Autre question"],
    continueFlow: false,
    state: null,
    catalogHint: {
      category: "cigarettes-electroniques",
      flavorTerms: [],
      limit: 3,
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
  if (/d[eé]bute la vape|besoin d['’][eê]tre guid|je d[eé]bute|completement d[eé]but|commencer (la )?(cigarette [eé]lectronique|vape)|n['’ ]y connais|je connais (absolument )?rien/i.test(t)) return "BEGINNER_VAPING";
  if (/taux de nicotine choisir|taux de nicotine|sels? de nicotine|nicotine classique|calcul(er)? (la )?nicotine/i.test(t))
    return "NICOTINE_GUIDANCE";
  if (/e-liquide fruit[eé]|meilleurs fruits|fruit[eé].*conseil/i.test(t))
    return "FRUIT_FLAVOUR_GUIDANCE";
  if (/mat[eé]riel.*commencer|mat[eé]riel adapt[eé] pour commencer|meilleur mat[eé]riel|choisis[- ]moi|arr[eê]ter de fumer/i.test(t))
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
