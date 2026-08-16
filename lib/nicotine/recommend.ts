import { NICOTINE_CONFIG, type NicotineType } from "./config";
import { isAllowedTarget, maxMgMl } from "./calculator";
import { classifyDevice, DEVICE_QUESTIONS, saltHighDoseNeedsDevice } from "./device-guard";
import { smokerProfileRangeForType, spokenSmokerProfileHint } from "./tables";
import type {
  NicotineProfileInput,
  NicotineRecommendation,
  RecommendationStatus,
} from "./types";

const RANGE = {
  low: [3, 6],
  mid: [6, 9],
  highFreebase: [9, 12],
  topFreebase: [12, 15],
  saltSoft: [9, 12],
  saltHigh: [15, 18],
} as const;

export function recommendNicotineProfile(input: NicotineProfileInput): NicotineRecommendation {
  if (!input.adult) {
    return finish({
      recommendedType: null,
      recommendedRange: [],
      confidence: "high",
      reasons: ["public_non_majeur"],
      warnings: ["Réservé aux adultes."],
      questionsNeeded: [],
      status: "BLOCKED_NON_SMOKER",
      spoken:
        "All Vap's ne conseille la nicotine qu'aux adultes. Je ne vais pas vous orienter vers un produit nicotiné.",
    });
  }

  const vaper = input.vaper === true || input.currentNicotineMg != null;
  if (!input.smoker && !vaper) {
    return finish({
      recommendedType: null,
      recommendedRange: [],
      confidence: "high",
      reasons: ["non_fumeur"],
      warnings: [],
      questionsNeeded: [],
      status: "BLOCKED_NON_SMOKER",
      spoken:
        "Si vous ne fumez pas actuellement, je ne vais pas vous orienter vers un produit nicotiné.",
    });
  }

  if (hasExcessSymptoms(input.symptoms)) {
    return finish({
      recommendedType: input.currentNicotineType ?? "FREEBASE",
      recommendedRange: currentOrLower(input),
      confidence: "high",
      reasons: ["signes_possible_exces"],
      warnings: [
        "Ne pas augmenter. Réduire ou interrompre temporairement l'apport nicotiné jusqu'à clarification. Ce n'est pas un avis médical.",
      ],
      questionsNeeded: [],
      status: "REDUCE_OR_PAUSE",
      spoken:
        "Ces signes peuvent évoquer un apport trop important. Je ne vais pas vous proposer d'augmenter. Mieux vaut réduire, ou faire une pause nicotinée, et en parler en boutique ou à un professionnel de santé si ça persiste.",
    });
  }

  const missing = missingQuestions(input);
  if (missing.includes("cravings") || missing.includes("throatHit")) {
    return finish({
      recommendedType: input.currentNicotineType ?? null,
      recommendedRange: [],
      confidence: "low",
      reasons: ["info_incomplete"],
      warnings: [],
      questionsNeeded: missing,
      status: "NEED_MORE_INFO",
      spoken: nextQuestionSpoken(missing[0]!),
    });
  }

  const type = input.currentNicotineType ?? "FREEBASE";
  const cravings = input.cravings ?? "MEDIUM";
  const hit = input.throatHit ?? "GOOD";
  const current = input.currentNicotineMg;

  if (
    (cravings === "NONE" || cravings === "LOW") &&
    hit === "GOOD" &&
    current != null
  ) {
    const keepType = type;
    if (!isAllowedTarget(keepType, current) && current > maxMgMl(keepType)) {
      return overLimit(keepType, current);
    }
    return finish({
      recommendedType: keepType,
      recommendedRange: [current],
      confidence: "high",
      reasons: ["manque_controle", "hit_agreable", "conserver_nicotine_classique"],
      warnings: [],
      questionsNeeded: [],
      status: "KEEP_CURRENT",
      spoken:
        keepType === "FREEBASE"
          ? `Vous pouvez rester sur la nicotine classique, autour de ${current} mg/ml. Aucune raison d'augmenter ni de passer aux sels si le manque est contrôlé et que le hit vous convient.`
          : `Vous pouvez rester sur les sels autour de ${current} mg/ml. Pas besoin de changer si vous êtes stable.`,
    });
  }

  if (cravings !== "NONE" && hit === "TOO_STRONG" && type === "FREEBASE") {
    const device = classifyDevice(input);
    const saltRange = suggestSaltRange(input);
    if (saltHighDoseNeedsDevice(saltRange[saltRange.length - 1]!) && device === "unknown") {
      return finish({
        recommendedType: "SALT",
        recommendedRange: saltRange.filter((n) => n < NICOTINE_CONFIG.salts.highDoseFromMgMl),
        confidence: "medium",
        reasons: ["manque_present", "freebase_trop_agressive", "materiel_inconnu"],
        warnings: ["Ne pas valider 18 ou 20 mg/ml sans connaître le matériel."],
        questionsNeeded: [...DEVICE_QUESTIONS],
        status: "BLOCKED_PENDING_DEVICE_INFO",
        spoken:
          "Comme vous avez encore du manque mais que la nicotine classique devient trop agressive, les sels de nicotine peuvent être une option à envisager si vous trouvez la nicotine classique trop agressive tout en ayant encore du manque. Avant de choisir le taux, je vais vérifier votre matériel.",
      });
    }
    if (saltHighDoseNeedsDevice(saltRange[saltRange.length - 1]!) && device === "high_vapor") {
      return finish({
        recommendedType: "SALT",
        recommendedRange: [9, 12, 15],
        confidence: "medium",
        reasons: ["manque_present", "freebase_trop_agressive", "materiel_puissant"],
        warnings: [
          "Matériel orienté forte vapeur : ne pas viser 18 ou 20 mg/ml. Privilégier un pod / faible puissance pour un sel élevé.",
        ],
        questionsNeeded: [],
        status: "CONSIDER_SALT",
        spoken:
          "Les sels de nicotine peuvent être une option à envisager si vous trouvez la nicotine classique trop agressive tout en ayant encore du manque. Avec un matériel plutôt puissant, on reste sur une fourchette plus basse, par exemple 9 à 15 mg, plutôt que 18 ou 20.",
      });
    }
    return finish({
      recommendedType: "SALT",
      recommendedRange: saltRange,
      confidence: "medium",
      reasons: ["manque_present", "freebase_trop_agressive", "materiel_compatible"],
      warnings: ["Ce n'est pas une obligation de passer aux sels."],
      questionsNeeded: device === "unknown" ? [...DEVICE_QUESTIONS] : [],
      status: "CONSIDER_SALT",
      spoken: spokenSaltOption(saltRange),
    });
  }

  if (cravings !== "NONE" && (current == null || current <= 6) && hit !== "TOO_STRONG") {
    const range = dependenceRange(input, "FREEBASE");
    return finish({
      recommendedType: "FREEBASE",
      recommendedRange: range,
      confidence: "medium",
      reasons: ["manque_present", "taux_actuel_faible", "augmentation_progressive"],
      warnings: [
        "D'abord stabiliser le remplacement du tabac. Ne pas baisser trop vite si cela fait reprendre la cigarette.",
      ],
      questionsNeeded: missing.filter((q) => q === "deviceType"),
      status: "INCREASE_PROGRESSIVE",
      spoken: withProfileHint(
        `Au vu de votre profil, ${formatRangeSpoken(range)} en nicotine classique peut être une zone de départ cohérente à évaluer. On ajuste ensuite selon le manque et le ressenti, sans viser un chiffre exact.`,
        input
      ),
    });
  }

  if (input.wantsReduction && (cravings === "NONE" || cravings === "LOW") && input.tobaccoReplaced) {
    const stepped = reductionStep(current ?? 6, type);
    return finish({
      recommendedType: type,
      recommendedRange: [stepped],
      confidence: "medium",
      reasons: ["reduction_progressive_volontaire"],
      warnings: ["Uniquement si vous le souhaitez et que le manque reste contrôlé."],
      questionsNeeded: [],
      status: "OK",
      spoken: `Si vous êtes stable et que vous le souhaitez, on peut viser une baisse progressive, par exemple vers ${stepped} mg, sans se forcer.`,
    });
  }

  const range = dependenceRange(input, type);
  return finish({
    recommendedType: type,
    recommendedRange: range,
    confidence: "medium",
    reasons: ["fourchette_de_depart"],
    warnings: [],
    questionsNeeded: missing.filter((q) => q.startsWith("device") || q === "deviceType"),
    status: "OK",
    spoken: withProfileHint(
      `Au vu de votre profil, ${formatRangeSpoken(range)} peut être une zone de départ cohérente à évaluer, puis à ajuster selon le ressenti et le manque.`,
      input
    ),
  });
}

export function evaluateRequestedStrength(
  type: NicotineType,
  mgMl: number,
  device?: Pick<NicotineProfileInput, "deviceType" | "resistanceOhm" | "powerWatts" | "inhalationType">
): NicotineRecommendation {
  if (type === "FREEBASE" && mgMl > NICOTINE_CONFIG.freebase.maxMgMl) {
    return overLimit("FREEBASE", mgMl);
  }
  if (type === "SALT" && mgMl > NICOTINE_CONFIG.salts.maxMgMl) {
    return overLimit("SALT", mgMl);
  }
  if (type === "SALT" && saltHighDoseNeedsDevice(mgMl)) {
    const risk = classifyDevice(device ?? {});
    if (risk === "unknown") {
      return finish({
        recommendedType: "SALT",
        recommendedRange: [],
        confidence: "low",
        reasons: ["sel_eleve_materiel_inconnu"],
        warnings: ["Ne pas valider 18 ou 20 mg/ml sans matériel."],
        questionsNeeded: [...DEVICE_QUESTIONS],
        status: "BLOCKED_PENDING_DEVICE_INFO",
        spoken:
          "Pour un sel à 18 ou 20 mg, j'ai besoin de connaître votre matériel avant de continuer : type d'appareil, résistance, puissance et type d'inhalation.",
      });
    }
    if (risk === "high_vapor") {
      return finish({
        recommendedType: "SALT",
        recommendedRange: [9, 12, 15],
        confidence: "medium",
        reasons: ["sel_eleve_materiel_puissant"],
        warnings: ["Éviter 18/20 mg sur un matériel fortement producteur de vapeur."],
        questionsNeeded: [],
        status: "BLOCKED_OVER_LIMIT",
        spoken:
          "Je ne recommande pas 18 ou 20 mg de sels sur un matériel puissant ou très producteur de vapeur. Un pod / faible puissance est plus adapté, ou une fourchette plus basse.",
      });
    }
  }
  if (!isAllowedTarget(type, mgMl)) {
    const max = maxMgMl(type);
    const allowed = type === "SALT" ? NICOTINE_CONFIG.salts.allowedTargets : NICOTINE_CONFIG.freebase.allowedTargets;
    const nearest = [...allowed].reverse().find((t) => t <= Math.min(mgMl, max)) ?? allowed[0];
    return finish({
      recommendedType: type,
      recommendedRange: [nearest],
      confidence: "medium",
      reasons: ["taux_hors_grille"],
      warnings: [`All Vap's propose ${allowed.join(", ")} mg/ml pour ce type.`],
      questionsNeeded: [],
      status: "OK",
      spoken: `Ce taux n'est pas dans la grille All Vap's. Pour ${type === "SALT" ? "les sels" : "la nicotine classique"}, on reste sur ${allowed.join(", ")} mg, maximum ${max} mg/ml.`,
    });
  }
  return finish({
    recommendedType: type,
    recommendedRange: [mgMl],
    confidence: "high",
    reasons: ["taux_dans_grille"],
    warnings: [],
    questionsNeeded: [],
    status: "OK",
    spoken: `Oui, ${mgMl} mg/ml est dans la grille ${type === "SALT" ? "sels (max 20)" : "nicotine classique (max 15)"} All Vap's.`,
  });
}

function overLimit(type: NicotineType, mgMl: number): NicotineRecommendation {
  if (type === "FREEBASE") {
    return finish({
      recommendedType: "FREEBASE",
      recommendedRange: [15],
      confidence: "high",
      reasons: ["plafond_freebase_15"],
      warnings: ["Limite All Vap's dépassée pour la nicotine classique."],
      questionsNeeded: [],
      status: "BLOCKED_OVER_LIMIT",
      spoken:
        "Je ne peux pas conseiller une nicotine classique au-dessus de 15 mg/ml. Si le manque reste fort et que la freebase devient trop agressive, les sels de nicotine peuvent être une option à envisager — sans obligation.",
    });
  }
  return finish({
    recommendedType: "SALT",
    recommendedRange: [20],
    confidence: "high",
    reasons: ["plafond_sels_20"],
    warnings: ["Taux supérieur à la limite autorisée/configurée."],
    questionsNeeded: [],
    status: "BLOCKED_OVER_LIMIT",
    spoken: `Je ne peux pas aller au-dessus de 20 mg/ml en sels de nicotine. ${mgMl} mg dépasse la limite All Vap's.`,
  });
}

function hasExcessSymptoms(symptoms?: string[]): boolean {
  if (!symptoms?.length) return false;
  const blob = symptoms.join(" ").toLowerCase();
  return NICOTINE_CONFIG.excessSymptoms.some((s) => blob.includes(s));
}

function currentOrLower(input: NicotineProfileInput): number[] {
  const current = input.currentNicotineMg;
  if (current == null) return [3, 6];
  const type = input.currentNicotineType ?? "FREEBASE";
  const allowed = type === "SALT" ? NICOTINE_CONFIG.salts.allowedTargets : NICOTINE_CONFIG.freebase.allowedTargets;
  const lower = [...allowed].filter((t) => t < current);
  return lower.length ? [lower[lower.length - 1]!] : [current];
}

function dependenceRange(input: NicotineProfileInput, type: NicotineType): number[] {
  const first = input.firstCigaretteAfterWakeMinutes;
  const tableRange = smokerProfileRangeForType(input.cigarettesPerDay, type);
  const wakeStrong = first != null && first < 5;
  const wakeModerate = first != null && first < 30;

  if (type === "SALT") {
    if (wakeStrong || (input.cigarettesPerDay ?? 0) >= 20) return [...RANGE.saltHigh];
    if (tableRange) return tableRange;
    if (wakeModerate) return [...RANGE.saltSoft];
    return [...RANGE.mid];
  }

  if (wakeStrong || (input.cigarettesPerDay ?? 0) >= 20) return [...RANGE.highFreebase];
  if (tableRange) return tableRange;
  if (wakeModerate) return [...RANGE.mid];
  return [...RANGE.low];
}

function withProfileHint(spoken: string, input: NicotineProfileInput): string {
  if (input.cigarettesPerDay == null) return spoken;
  if ((input.cigarettesPerDay ?? 0) < 20) return spoken;
  return `${spoken} ${spokenSmokerProfileHint(input.cigarettesPerDay)}`;
}

function formatRangeSpoken(range: number[]): string {
  if (!range.length) return "une fourchette boutique";
  if (range.length === 1) return `${range[0]} mg`;
  return `${range[0]} à ${range[range.length - 1]} mg`;
}

function suggestSaltRange(input: NicotineProfileInput): number[] {
  const cigs = input.cigarettesPerDay ?? 0;
  const first = input.firstCigaretteAfterWakeMinutes;
  if ((first != null && first < 5) || cigs >= 20) return [12, 15, 18];
  return [9, 12, 15];
}

function reductionStep(current: number, type: NicotineType): number {
  const allowed = type === "SALT" ? NICOTINE_CONFIG.salts.allowedTargets : NICOTINE_CONFIG.freebase.allowedTargets;
  const lower = [...allowed].filter((t) => t < current);
  return lower.length ? lower[lower.length - 1]! : 0;
}

function missingQuestions(input: NicotineProfileInput): string[] {
  const needed: string[] = [];
  if (input.smoker && input.cigarettesPerDay == null) needed.push("cigarettesPerDay");
  if (input.smoker && input.firstCigaretteAfterWakeMinutes == null) {
    needed.push("firstCigaretteAfterWakeMinutes");
  }
  if (input.currentNicotineMg == null && input.vaper) needed.push("currentNicotineMg");
  if (input.cravings == null) needed.push("cravings");
  if (input.throatHit == null) needed.push("throatHit");
  if (input.vapingFrequency == null && input.vaper) needed.push("vapingFrequency");
  if (!input.deviceType && input.powerWatts == null) needed.push("deviceType");
  return needed;
}

function nextQuestionSpoken(id: string): string {
  switch (id) {
    case "cigarettesPerDay":
      return "Combien de cigarettes fumez-vous par jour ?";
    case "firstCigaretteAfterWakeMinutes":
      return "Combien de temps après votre réveil fumez-vous votre première cigarette ? Moins de 5 minutes, 5 à 30 minutes, 30 à 60 minutes, ou plus d'une heure ?";
    case "currentNicotineMg":
      return "Quel taux de nicotine utilisez-vous actuellement ?";
    case "cravings":
      return "Avez-vous encore envie de fumer malgré votre vape ? Est-ce surtout un manque, ou le liquide vous semble-t-il déjà agressif en gorge ?";
    case "throatHit":
      return "La nicotine actuelle vous semble-t-elle trop forte en gorge ?";
    case "vapingFrequency":
      return "Avez-vous tendance à vapoter très souvent pour compenser ?";
    case "deviceType":
      return "Quel matériel utilisez-vous ? Type d'appareil, résistance et puissance si vous les connaissez.";
    default:
      return "Je manque d'une information pour vous orienter sans inventer un taux.";
  }
}

function spokenSaltOption(range: number[]): string {
  const from = range[0];
  const to = range[range.length - 1];
  return `Comme vous avez encore du manque mais que la nicotine classique devient trop agressive, les sels de nicotine peuvent être une option à envisager. Avant de figer un taux, une fourchette du type ${from} à ${to} mg peut servir de point de départ à tester — pas un besoin exact.`;
}

function finish(rec: NicotineRecommendation): NicotineRecommendation {
  return rec;
}
