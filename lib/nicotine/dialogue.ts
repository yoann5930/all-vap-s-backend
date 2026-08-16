import { mixNicotine, formatMixSpoken } from "./calculator";
import { extractProfileHints, isNicotineConversation, parseCravingAnswer, parseMixRequest, parseThroatAnswer, parseWakeDelay } from "./extract";
import { evaluateRequestedStrength, recommendNicotineProfile } from "./recommend";
import { isComparisonQuestion, isConsumptionQuestion, spokenConsumption, spokenTypeComparison } from "./tables";
import type { NicotineInterviewState, NicotineProfileInput } from "./types";

export type NicotineTurn = {
  spoken: string;
  suggestions: string[];
  interview: NicotineInterviewState | null;
  done: boolean;
};

const QUESTION_ORDER = [
  "smoker",
  "triedVape",
  "currentNicotineMg",
  "cravings",
  "throatHit",
  "cigarettesPerDay",
  "firstCigaretteAfterWakeMinutes",
  "vapingFrequency",
  "deviceType",
] as const;

export function continueNicotineDialogue(
  prev: NicotineInterviewState | null,
  message: string,
  opts?: { adult?: boolean }
): NicotineTurn {
  const mix = parseMixRequest(message);
  if (mix) {
    const result = mixNicotine(mix);
    return {
      spoken: formatMixSpoken(result, true),
      suggestions: result.alert ? ["Recalculer", "Parler du taux"] : ["Voir le taux réel", "Autre question"],
      interview: prev,
      done: true,
    };
  }

  if (isComparisonQuestion(message)) {
    return {
      spoken: spokenTypeComparison(),
      suggestions: ["Parler du taux", "Calculer un booster"],
      interview: prev,
      done: prev == null,
    };
  }

  if (isConsumptionQuestion(message)) {
    const mgHint = extractProfileHints(message).currentNicotineMg ?? prev?.input.currentNicotineMg;
    return {
      spoken: spokenConsumption(mgHint),
      suggestions: ["Parler du taux", "Autre question"],
      interview: prev,
      done: prev == null,
    };
  }

  const interview: NicotineInterviewState = {
    input: {
      adult: opts?.adult ?? prev?.input.adult ?? true,
      ...(prev?.input ?? {}),
      ...extractProfileHints(message),
    },
    asked: [...(prev?.asked ?? [])],
  };

  applyAnswerToCurrentQuestion(interview, message);

  const input = interview.input;
  if (input.adult === false || (input.smoker === false && !input.vaper && input.currentNicotineMg == null)) {
    const rec = recommendNicotineProfile({
      adult: input.adult !== false,
      smoker: false,
    });
    return {
      spoken: rec.spoken,
      suggestions: ["Voir les e-liquides 0 mg", "Autre question"],
      interview: null,
      done: true,
    };
  }

  const nextQ = nextQuestion(interview);
  if (nextQ) {
    interview.asked.push(nextQ);
    return {
      spoken: questionText(nextQ, interview),
      suggestions: questionSuggestions(nextQ),
      interview,
      done: false,
    };
  }

  const rec = recommendNicotineProfile(completeInput(interview.input));
  if (rec.status === "NEED_MORE_INFO" && rec.questionsNeeded[0]) {
    interview.asked.push(rec.questionsNeeded[0]);
    return {
      spoken: rec.spoken,
      suggestions: questionSuggestions(rec.questionsNeeded[0]),
      interview,
      done: false,
    };
  }
  if (rec.status === "BLOCKED_PENDING_DEVICE_INFO") {
    interview.asked.push("deviceType");
    return {
      spoken: rec.spoken,
      suggestions: ["Pod / faible puissance", "Box / plus puissant", "Je ne sais pas"],
      interview,
      done: false,
    };
  }

  const requested = requestedStrength(message, interview);
  const finalRec = requested
    ? evaluateRequestedStrength(requested.type, requested.mg, interview.input)
    : rec;

  return {
    spoken: finalRec.spoken,
    suggestions: suggestionsFor(finalRec.status),
    interview: { ...interview, lastSpoken: finalRec.spoken },
    done: finalRec.status !== "NEED_MORE_INFO" && finalRec.status !== "BLOCKED_PENDING_DEVICE_INFO",
  };
}

export function startNicotineDialogue(message?: string, adult = true): NicotineTurn {
  return continueNicotineDialogue(
    { input: { adult }, asked: [] },
    message || "",
    { adult }
  );
}

function completeInput(partial: NicotineInterviewState["input"]): NicotineProfileInput {
  return {
    adult: partial.adult !== false,
    smoker: partial.smoker === true,
    vaper: partial.vaper,
    cigarettesPerDay: partial.cigarettesPerDay,
    firstCigaretteAfterWakeMinutes: partial.firstCigaretteAfterWakeMinutes,
    currentNicotineMg: partial.currentNicotineMg,
    currentNicotineType: partial.currentNicotineType,
    cravings: partial.cravings,
    throatHit: partial.throatHit,
    deviceType: partial.deviceType,
    resistanceOhm: partial.resistanceOhm,
    powerWatts: partial.powerWatts,
    inhalationType: partial.inhalationType,
    vapingFrequency: partial.vapingFrequency,
    symptoms: partial.symptoms,
    wantsReduction: partial.wantsReduction,
    tobaccoReplaced: partial.tobaccoReplaced,
  };
}

function nextQuestion(state: NicotineInterviewState): string | null {
  const i = state.input;
  for (const q of QUESTION_ORDER) {
    if (state.asked.includes(q) && alreadyFilled(i, q)) continue;
    if (alreadyFilled(i, q)) continue;
    if (q === "cigarettesPerDay" && i.smoker === false) continue;
    if (q === "firstCigaretteAfterWakeMinutes" && i.smoker === false) continue;
    if (q === "triedVape" && (i.vaper || i.currentNicotineMg != null)) continue;
    if (q === "currentNicotineMg" && i.vaper === false && i.currentNicotineMg == null && i.smoker && !i.vaper) {
      continue;
    }
    if (q === "vapingFrequency" && !i.vaper && i.currentNicotineMg == null) continue;
    if (q === "deviceType" && i.deviceType) continue;
    if (!alreadyFilled(i, q)) return q;
  }
  return null;
}

function alreadyFilled(i: NicotineInterviewState["input"], q: string): boolean {
  switch (q) {
    case "smoker":
      return i.smoker != null || i.vaper != null;
    case "cigarettesPerDay":
      return i.cigarettesPerDay != null;
    case "firstCigaretteAfterWakeMinutes":
      return i.firstCigaretteAfterWakeMinutes != null;
    case "triedVape":
      return i.vaper != null || i.currentNicotineMg != null;
    case "currentNicotineMg":
      return i.currentNicotineMg != null || i.vaper === false;
    case "cravings":
      return i.cravings != null;
    case "throatHit":
      return i.throatHit != null;
    case "vapingFrequency":
      return i.vapingFrequency != null;
    case "deviceType":
      return Boolean(i.deviceType) || i.powerWatts != null;
    default:
      return false;
  }
}

function applyAnswerToCurrentQuestion(state: NicotineInterviewState, message: string) {
  const last = state.asked[state.asked.length - 1];
  const n = message.toLowerCase();
  if (last === "smoker") {
    if (/jamais|ne fume pas|non/.test(n) && !/encore/.test(n)) state.input.smoker = false;
    else if (/vapot/.test(n)) {
      state.input.vaper = true;
      state.input.smoker = /fume encore|les deux/.test(n);
    } else state.input.smoker = true;
  }
  if (last === "cigarettesPerDay") {
    const m = n.match(/(\d+)/);
    if (m) state.input.cigarettesPerDay = parseInt(m[1]!, 10);
  }
  if (last === "firstCigaretteAfterWakeMinutes") {
    const d = parseWakeDelay(message);
    if (d != null) state.input.firstCigaretteAfterWakeMinutes = d;
  }
  if (last === "triedVape") {
    if (/oui|deja|déjà|vapot/.test(n)) state.input.vaper = true;
    else if (/non|jamais/.test(n)) state.input.vaper = false;
  }
  if (last === "currentNicotineMg") {
    const m = n.match(/(\d+(?:[.,]\d+)?)/);
    if (m) state.input.currentNicotineMg = parseFloat(m[1]!.replace(",", "."));
    if (/sel/.test(n)) state.input.currentNicotineType = "SALT";
    if (/classique|freebase/.test(n)) state.input.currentNicotineType = "FREEBASE";
  }
  if (last === "cravings") {
    const c = parseCravingAnswer(message);
    if (c) state.input.cravings = c;
  }
  if (last === "throatHit") {
    const t = parseThroatAnswer(message);
    if (t) state.input.throatHit = t;
  }
  if (last === "vapingFrequency") {
    state.input.vapingFrequency = /oui|souvent/.test(n) ? "high" : "normal";
  }
  if (last === "deviceType") {
    state.input.deviceType = message.slice(0, 80);
  }
}

function questionText(id: string, state: NicotineInterviewState): string {
  if (id === "cravings" && state.input.currentNicotineMg != null) {
    return `Est-ce que vous ressentez surtout un manque de nicotine, ou est-ce que le ${state.input.currentNicotineMg} mg vous semble déjà agressif en gorge ?`;
  }
  switch (id) {
    case "smoker":
      return "D'accord. Je peux vous aider à vous orienter parmi les taux proposés en boutique — sans avis médical. Fumez-vous encore des cigarettes, ou vapotez-vous déjà ?";
    case "cigarettesPerDay":
      return "Combien de cigarettes fumez-vous par jour ?";
    case "firstCigaretteAfterWakeMinutes":
      return "Combien de temps après votre réveil fumez-vous votre première cigarette ?";
    case "triedVape":
      return "Avez-vous déjà essayé la cigarette électronique ?";
    case "currentNicotineMg":
      return "Quel taux de nicotine utilisez-vous actuellement ?";
    case "cravings":
      return "Avez-vous encore envie de fumer malgré votre vape ?";
    case "throatHit":
      return "La nicotine actuelle vous semble-t-elle trop forte en gorge ?";
    case "vapingFrequency":
      return "Avez-vous tendance à vapoter très souvent pour compenser ?";
    case "deviceType":
      return "Quel matériel utilisez-vous ? Type d'appareil, résistance et puissance si vous les connaissez.";
    default:
      return "Je continue.";
  }
}

function questionSuggestions(id: string): string[] {
  switch (id) {
    case "smoker":
      return ["Je fume encore", "Je vapote déjà", "Les deux", "Je ne fume pas"];
    case "cigarettesPerDay":
      return ["Moins de 5", "Environ 10", "Environ 20", "Plus de 20"];
    case "firstCigaretteAfterWakeMinutes":
      return ["Moins de 5 minutes", "5 à 30 minutes", "30 à 60 minutes", "Plus d'une heure"];
    case "triedVape":
      return ["Oui", "Non"];
    case "currentNicotineMg":
      return ["3 mg", "6 mg", "9 mg", "12 mg", "Je ne sais pas"];
    case "cravings":
      return ["Surtout un manque", "Déjà agressif en gorge", "Les deux", "Plus du tout"];
    case "throatHit":
      return ["Oui, trop fort", "Non, ça va", "Trop doux"];
    case "vapingFrequency":
      return ["Oui, souvent", "Non"];
    case "deviceType":
      return ["Pod / faible puissance", "Box / plus puissant", "Je ne sais pas"];
    default:
      return ["Continuer"];
  }
}

function suggestionsFor(status: string): string[] {
  if (status === "BLOCKED_NON_SMOKER") return ["Voir les e-liquides 0 mg", "Autre question"];
  if (status === "CONSIDER_SALT") return ["Parler des sels", "Rester en classique", "Indiquer mon matériel"];
  if (status === "REDUCE_OR_PAUSE") return ["Parler en boutique", "Autre question"];
  return ["Voir des e-liquides", "Calculer un booster", "Autre question"];
}

function requestedStrength(message: string, interview: NicotineInterviewState): { type: "FREEBASE" | "SALT"; mg: number } | null {
  const n = message.toLowerCase();
  const m = n.match(/(\d+)\s*mg/);
  if (!m) return null;
  if (!/je veux|prendre|passer a|passe[rz]/.test(n)) return null;
  const mg = parseInt(m[1]!, 10);
  const type = /sel/.test(n) || interview.input.currentNicotineType === "SALT" ? "SALT" : "FREEBASE";
  return { type, mg };
}

export { isNicotineConversation };
