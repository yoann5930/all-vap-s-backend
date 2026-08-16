/**
 * Orientation nicotine débutant — moteur déterministe (table boutique All Vap's).
 * Jamais « les taux vont de 0 à 18 mg ». Jamais un chiffre inventé hors table.
 */
import { recommendNicotineProfile } from "@/lib/nicotine/recommend";
import {
  lookupSmokerProfile,
  spokenSmokerProfileHint,
} from "@/lib/nicotine/tables";
import type { NicotineRecommendation } from "@/lib/nicotine/types";

export function beginnerNicotineOrientation(opts: {
  cigarettesPerDay: number;
  allDayNeed?: boolean;
  deviceKind?: "pod" | "kit" | "unknown";
}): { spoken: string; recommendation: NicotineRecommendation } {
  const cigs = opts.cigarettesPerDay;
  const profile = lookupSmokerProfile(cigs);
  const deviceType =
    opts.deviceKind === "kit" ? "pod" : opts.deviceKind === "pod" ? "pod" : "pod";
  const rec = recommendNicotineProfile({
    adult: true,
    smoker: true,
    cigarettesPerDay: cigs,
    cravings: opts.allDayNeed ? "HIGH" : "MEDIUM",
    throatHit: "GOOD",
    deviceType,
  });
  const tableHint = spokenSmokerProfileHint(cigs);
  const range = rec.recommendedRange.length
    ? rec.recommendedRange
    : profile
      ? [...profile.rangeMgMl]
      : [];
  const from = range[0];
  const to = range[range.length - 1];
  const rangeTxt =
    from == null ? null : from === to ? `${from} mg/ml` : `${from} à ${to} mg/ml`;
  const typeBit =
    rec.recommendedType === "SALT"
      ? "plutôt en sels de nicotine, sur un matériel simple (pod), "
      : rec.recommendedType === "FREEBASE"
        ? "en nicotine classique, "
        : "";
  const spoken = rangeTxt
    ? `Avec une consommation autour de ${cigs} cigarettes par jour, la table boutique All Vap's oriente souvent vers ${typeBit}environ ${rangeTxt}. ${tableHint} Ce n'est pas un avis médical, juste une zone de départ à ajuster ensuite.`
    : `${tableHint} Je ne vais pas inventer un chiffre hors table boutique.`;
  return { spoken, recommendation: rec };
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
    return "Je note. On pourra réajuster avec la table boutique, sans inventer un nouveau chiffre.";
  }
  const rec = beginnerNicotineOrientation({
    cigarettesPerDay: opts.cigarettesPerDay,
    allDayNeed: opts.feedback === "TOO_WEAK" || opts.feedback === "USAGE_UP",
    deviceKind: "pod",
  });
  if (opts.feedback === "TOO_STRONG") {
    return `Je note que c'est trop fort. On reste dans la table boutique, plutôt vers le bas de la zone. ${rec.spoken}`;
  }
  if (opts.feedback === "TOO_WEAK" || opts.feedback === "USAGE_UP") {
    return `Je note. On peut regarder le haut de la zone boutique, toujours sans sortir de la table. ${rec.spoken}`;
  }
  return rec.spoken;
}
