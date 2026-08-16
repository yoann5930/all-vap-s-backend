import { NICOTINE_CONFIG, type NicotineType } from "./config";
import type { MixInput, MixResult } from "./types";

/**
 * Taux réel :
 *   totalNicotineMg = boosterCount * boosterVolumeMl * boosterStrengthMgMl
 *   finalVolumeMl   = baseVolumeMl + boosterCount * boosterVolumeMl
 *   finalNicotineMgMl = totalNicotineMg / finalVolumeMl
 *
 * Distinct du taux commercial All Vap's (ALLVAPS_COMMERCIAL_TARGET).
 */
export function mixNicotine(input: MixInput): MixResult {
  const boosterCount = Math.max(0, Math.floor(input.boosterCount));
  const totalNicotineMg =
    boosterCount * input.boosterVolumeMl * input.boosterStrengthMgMl;
  const finalVolumeMl = input.baseVolumeMl + boosterCount * input.boosterVolumeMl;
  const actualMgMl = finalVolumeMl > 0 ? totalNicotineMg / finalVolumeMl : 0;
  const commercialTargetMgMl = commercialTargetAllVaps(input);
  const overFreebaseLimit = actualMgMl > NICOTINE_CONFIG.freebase.maxMgMl;
  const overSaltLimit = actualMgMl > NICOTINE_CONFIG.salts.maxMgMl;
  const freebaseBoosterCapExceeded =
    input.nicotineType === "FREEBASE" &&
    isAllVaps50mlWorkflow(input) &&
    boosterCount > NICOTINE_CONFIG.freebase.maxBoostersFor50ml;

  let alert: string | null = null;
  if (input.nicotineType === "FREEBASE" && (overFreebaseLimit || freebaseBoosterCapExceeded)) {
    alert = "Limite All Vap's dépassée pour la nicotine classique.";
  } else if (input.nicotineType === "SALT" && overSaltLimit) {
    alert = "Taux supérieur à la limite autorisée/configurée.";
  }

  return {
    finalVolumeMl,
    totalNicotineMg,
    actualMgMl,
    commercialTargetMgMl,
    overFreebaseLimit,
    overSaltLimit,
    freebaseBoosterCapExceeded,
    alert,
  };
}

export function roundMgMl(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export function isAllowedTarget(type: NicotineType, mgMl: number): boolean {
  const cfg = type === "SALT" ? NICOTINE_CONFIG.salts : NICOTINE_CONFIG.freebase;
  return cfg.allowedTargets.some((t) => t === mgMl) && mgMl <= cfg.maxMgMl;
}

export function maxMgMl(type: NicotineType): number {
  return type === "SALT" ? NICOTINE_CONFIG.salts.maxMgMl : NICOTINE_CONFIG.freebase.maxMgMl;
}

function isAllVaps50mlWorkflow(input: MixInput): boolean {
  const c = NICOTINE_CONFIG.allvapsCommercial50ml;
  return (
    input.baseVolumeMl === c.baseVolumeMl &&
    input.boosterVolumeMl === c.boosterVolumeMl &&
    input.boosterStrengthMgMl === c.boosterStrengthMgMl
  );
}

/** Cible commerciale All Vap's, pas la formule physique. */
export function commercialTargetAllVaps(input: MixInput): number | null {
  if (!isAllVaps50mlWorkflow(input)) return null;
  const mapped = NICOTINE_CONFIG.allvapsCommercial50ml.targetByBoosterCount[input.boosterCount];
  return mapped ?? null;
}

export function formatMixSpoken(result: MixResult, simpleClient = true): string {
  const actual = roundMgMl(result.actualMgMl);
  if (result.alert) {
    return `${result.alert} Volume final ${roundMgMl(result.finalVolumeMl, 1)} ml, taux calculé ${actual} mg/ml.`;
  }
  if (simpleClient && result.commercialTargetMgMl != null) {
    return `Taux cible All Vap's : ${result.commercialTargetMgMl} mg/ml.`;
  }
  if (result.commercialTargetMgMl != null) {
    return `Taux cible All Vap's : ${result.commercialTargetMgMl} mg/ml. Taux calculé réel : ${actual} mg/ml.`;
  }
  return `Volume final ${roundMgMl(result.finalVolumeMl, 1)} ml, nicotine totale ${roundMgMl(result.totalNicotineMg, 1)} mg, soit ${actual} mg/ml.`;
}
