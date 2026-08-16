/**
 * Orientation nicotine débutant — moteur déterministe, phrase boutique.
 * Les métadonnées (table, reasons) restent internes. Le client n'entend qu'une fourchette.
 */
import { recommendNicotineProfile } from "@/lib/nicotine/recommend";
import { lookupSmokerProfile, smokerProfileRangeForType } from "@/lib/nicotine/tables";
import type { NicotineType } from "@/lib/nicotine/config";
import type { NicotineRecommendation } from "@/lib/nicotine/types";

function preferredBeginnerType(
  cigs: number,
  deviceKind?: "pod" | "kit" | "unknown",
): NicotineType {
  const profile = lookupSmokerProfile(cigs);
  if (!profile) return "FREEBASE";
  if (deviceKind === "kit") {
    return profile.types.includes("FREEBASE") ? "FREEBASE" : "SALT";
  }
  if (profile.types.includes("SALT") && (!profile.types.includes("FREEBASE") || cigs >= 11)) {
    return "SALT";
  }
  return profile.types.includes("FREEBASE") ? "FREEBASE" : "SALT";
}

function clientRangePhrase(from: number, to: number): string {
  return from === to ? `autour de ${from} mg/ml` : `autour de ${from} à ${to} mg/ml`;
}

export function beginnerNicotineOrientation(opts: {
  cigarettesPerDay: number;
  allDayNeed?: boolean;
  deviceKind?: "pod" | "kit" | "unknown";
  hasSelectedDevice?: boolean;
}): { spoken: string; recommendation: NicotineRecommendation } {
  const cigs = opts.cigarettesPerDay;
  const type = preferredBeginnerType(cigs, opts.deviceKind ?? "pod");
  const tableRange = smokerProfileRangeForType(cigs, type);
  const rec = recommendNicotineProfile({
    adult: true,
    smoker: true,
    cigarettesPerDay: cigs,
    cravings: opts.allDayNeed ? "HIGH" : "MEDIUM",
    throatHit: "GOOD",
    deviceType: opts.deviceKind === "kit" ? "kit" : "pod",
    currentNicotineType: type,
  });
  const range = tableRange?.length
    ? tableRange
    : rec.recommendedRange.length
      ? rec.recommendedRange
      : [];
  const from = range[0];
  const to = range[range.length - 1];
  const spoken =
    from == null
      ? "Dites-moi d'abord votre consommation, je pourrai vous indiquer une nicotine de départ."
      : opts.hasSelectedDevice
        ? `Avec votre consommation, je partirais ${clientRangePhrase(from, to)} pour commencer. On ajustera ensuite selon votre ressenti.`
        : `Avec votre consommation, je partirais ${clientRangePhrase(from, to)} pour commencer. Une fois votre matériel choisi, on vérifiera que ça correspond bien.`;
  return {
    spoken,
    recommendation: {
      ...rec,
      recommendedType: type,
      recommendedRange: range,
      spoken,
      reasons: rec.reasons,
      warnings: [],
    },
  };
}

export function speakNicotineFollowup(opts: {
  feedback: import("@/lib/ava/advisor-policy").NicotineFeedback;
  cigarettesPerDay: number | null;
}): string {
  if (!opts.feedback) return "";
  if (opts.feedback === "OK") {
    return "Parfait, on garde cette orientation tant que ça vous convient. Dites-moi si ça change.";
  }
  if (opts.cigarettesPerDay == null) {
    return "Je note. Dites-moi environ combien de cigarettes il vous reste par jour, je réajusterai la nicotine.";
  }
  const rec = beginnerNicotineOrientation({
    cigarettesPerDay: opts.cigarettesPerDay,
    allDayNeed: opts.feedback === "TOO_WEAK" || opts.feedback === "USAGE_UP",
    deviceKind: "pod",
    hasSelectedDevice: true,
  });
  const range = rec.recommendation.recommendedRange;
  const from = range[0];
  const to = range[range.length - 1];
  if (from == null || to == null) return rec.spoken;
  if (opts.feedback === "TOO_STRONG") {
    return `Je comprends. On vise plutôt le bas de la fourchette, autour de ${from} mg/ml, et on voit comment vous vous sentez.`;
  }
  if (opts.feedback === "TOO_WEAK" || opts.feedback === "USAGE_UP") {
    return `Je note, le manque est encore là. On peut viser le haut de la fourchette, autour de ${to} mg/ml, et on réajuste ensuite.`;
  }
  return rec.spoken;
}
