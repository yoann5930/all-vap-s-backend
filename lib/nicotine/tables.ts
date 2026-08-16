import {
  NICOTINE_CLASSIC_FACTS,
  NICOTINE_CONFIG,
  NICOTINE_SALT_FACTS,
  type NicotineType,
} from "./config";

export type ConsumptionEstimate = (typeof NICOTINE_CONFIG.consumptionEstimates)[number];
export type SmokerProfileRef = (typeof NICOTINE_CONFIG.smokerProfileReference)[number];

/** Table conso All Vap's — indicatif, pas un diagnostic. */
export function lookupConsumptionEstimate(mgMl: number): ConsumptionEstimate | undefined {
  const exact = NICOTINE_CONFIG.consumptionEstimates.find((row) => row.mgMl === mgMl);
  if (exact) return exact;
  const nearest = [...NICOTINE_CONFIG.consumptionEstimates].sort(
    (a, b) => Math.abs(a.mgMl - mgMl) - Math.abs(b.mgMl - mgMl)
  )[0];
  return nearest;
}

/**
 * Table profil fumeur — référence secondaire uniquement.
 * 20 cig/jour et + = gros fumeur (table « 20 et + »), jamais un SKU 16 mg.
 */
export function lookupSmokerProfile(cigarettesPerDay: number): SmokerProfileRef | undefined {
  return NICOTINE_CONFIG.smokerProfileReference.find(
    (row) => cigarettesPerDay >= row.cigsMin && cigarettesPerDay <= row.cigsMax
  );
}

export function smokerProfileRangeForType(
  cigarettesPerDay: number | undefined,
  type: NicotineType
): number[] | null {
  if (cigarettesPerDay == null) return null;
  const profile = lookupSmokerProfile(cigarettesPerDay);
  if (!profile) return null;
  if (profile.id === "gros_fumeur") {
    return type === "SALT" ? [15, 18] : [9, 12];
  }
  if (!(profile.types as readonly string[]).includes(type)) {
    return type === "SALT" ? [...profile.rangeMgMl] : [9, 12];
  }
  if (profile.rangeMgMl.length === 1) {
    const n = profile.rangeMgMl[0]!;
    return type === "SALT" ? [n, Math.min(n + 3, 12)] : [n];
  }
  return [...profile.rangeMgMl];
}

export function spokenConsumption(mgMl?: number): string {
  if (mgMl == null) {
    return (
      "À titre indicatif, la table All Vap's situe souvent 5 à 8 ml par jour autour de 3 mg, " +
      "3 à 5 ml autour de 6 mg, 2 à 4 ml autour de 9 mg, et 1,5 à 3 ml autour de 12 mg. " +
      "Ce n'est pas un diagnostic : ça varie selon le matériel et le rythme."
    );
  }
  const row = lookupConsumptionEstimate(mgMl);
  if (!row) {
    return "Je n'ai pas de table de consommation pour ce taux. On reste sur une estimation boutique, pas un chiffre exact.";
  }
  const approx = row.mgMl !== mgMl ? ` (référence la plus proche : ${row.mgMl} mg)` : "";
  return (
    `À titre indicatif${approx}, autour de ${row.mgMl} mg/ml, la table All Vap's situe souvent ` +
    `${row.mlPerDay} par jour, ${row.mlPerMonth} par mois, et ${row.puffsPerDay} bouffées. ` +
    `C'est une fourchette boutique, pas un besoin exact.`
  );
}

export function spokenTypeComparison(): string {
  return (
    `La nicotine classique a souvent un hit plus marqué en gorge (${NICOTINE_CLASSIC_FACTS.hit_gorge.toLowerCase()}), ` +
    `et se vape sur beaucoup de matériels, surtout en subohm. Plafond All Vap's : ${NICOTINE_CLASSIC_FACTS.limite}. ` +
    `Les sels sont généralement plus doux, plutôt pour pods et faible puissance, jusqu'à ${NICOTINE_SALT_FACTS.limite}. ` +
    `Le ressenti n'est pas identique pour tout le monde : je ne promets pas une vitesse d'absorption précise.`
  );
}

export function spokenSmokerProfileHint(cigarettesPerDay: number): string {
  const profile = lookupSmokerProfile(cigarettesPerDay);
  if (!profile) {
    return "Le nombre de cigarettes aide à situer une zone, mais ce n'est pas cigarettes multiplié par paquet.";
  }
  if (profile.id === "gros_fumeur") {
    return (
      "Le tableau boutique All Vap's oriente souvent les gros fumeurs vers les sels, autour de 15 à 18 mg. " +
      "C'est une fourchette de départ, pas un besoin exact, et pas une obligation de changer."
    );
  }
  const from = profile.rangeMgMl[0];
  const to = profile.rangeMgMl[profile.rangeMgMl.length - 1];
  const range = from === to ? `${from} mg` : `${from} à ${to} mg`;
  return (
    `Le tableau boutique All Vap's situe souvent ce profil autour de ${range} (${profile.note.toLowerCase()}). ` +
    `C'est une zone de départ à évaluer, pas un chiffre que vous devez viser.`
  );
}

export function isConsumptionQuestion(message: string): boolean {
  const n = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  return (
    /combien (je|on) (vais|va|vais-je) vapoter/.test(n) ||
    /consommation (estimee|par jour|mensuelle|de liquide)/.test(n) ||
    /conso (estimee|par jour|mensuelle)/.test(n) ||
    /bouffees? par jour/.test(n) ||
    /combien de (ml|millilitres|bouffees)/.test(n)
  );
}

export function isComparisonQuestion(message: string): boolean {
  const n = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  return (
    /difference.*(sels?|classique)|sels?.*(ou|et|vs|versus).*classique/.test(n) ||
    /c est quoi (les )?sels|sels ou classique|nicotine classique ou sels/.test(n) ||
    /hit en gorge|freebase ou sel/.test(n)
  );
}
