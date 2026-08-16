/**
 * Configuration unique All Vap's — nicotine classique / sels.
 * Ne pas dupliquer ces plafonds ailleurs.
 */
export const NICOTINE_CONFIG = {
  freebase: {
    allowedTargets: [3, 6, 9, 12, 15] as const,
    maxMgMl: 15,
    maxBoostersFor50ml: 5,
  },
  salts: {
    allowedTargets: [3, 6, 9, 12, 15, 18, 20] as const,
    maxMgMl: 20,
    highDoseFromMgMl: 18,
  },
  /** Référence commerciale boutique 50 ml + boosters 10 ml / 20 mg/ml. */
  allvapsCommercial50ml: {
    baseVolumeMl: 50,
    boosterVolumeMl: 10,
    boosterStrengthMgMl: 20,
    targetByBoosterCount: {
      1: 3,
      2: 6,
      3: 9,
      4: 12,
      5: 15,
    } as Record<number, number>,
  },
  device: {
    /** Seuil configurable : au-delà, un sel ≥ 18 mg demande confirmation. */
    highPowerWattsFrom: 40,
    highVaporKeywords: [
      "subohm",
      "sub-ohm",
      "sub ohm",
      "cloud",
      "rda",
      "rdta",
      "direct lung",
      "inhalation directe",
      "grosse vapeur",
    ],
  },
  excessSymptoms: [
    "nausees",
    "nausées",
    "maux de tete",
    "maux de tête",
    "vertiges",
    "palpitations",
    "malaise",
    "surdosage",
    "trop de nicotine",
  ],
  /**
   * Table boutique All Vap's — consommation estimée (indicatif, pas un diagnostic).
   * Source : tableau interne taux / conso / bouffées.
   */
  consumptionEstimates: [
    { mgMl: 3, mlPerDay: "5 à 8 ml", mlPerMonth: "~180 ml", puffsPerDay: "250 à 350" },
    { mgMl: 6, mlPerDay: "3 à 5 ml", mlPerMonth: "~120 ml", puffsPerDay: "150 à 250" },
    { mgMl: 9, mlPerDay: "2 à 4 ml", mlPerMonth: "~90 ml", puffsPerDay: "120 à 180" },
    { mgMl: 12, mlPerDay: "1,5 à 3 ml", mlPerMonth: "~60 ml", puffsPerDay: "80 à 150" },
  ],
  /**
   * Table boutique profil fumeur — référence secondaire, jamais cigarettes × paquet.
   * Gros fumeur 16–18 mg : sels uniquement, ramené à la grille 15–18 (pas de 16 inventé, pas de classique > 15).
   */
  smokerProfileReference: [
    {
      id: "petit_fumeur",
      cigsMin: 1,
      cigsMax: 5,
      rangeMgMl: [3],
      types: ["FREEBASE", "SALT"],
      note: "Classique ou sels",
    },
    {
      id: "fumeur_modere",
      cigsMin: 6,
      cigsMax: 10,
      rangeMgMl: [6],
      types: ["FREEBASE", "SALT"],
      note: "Classique ou sels",
    },
    {
      id: "fumeur_regulier",
      cigsMin: 11,
      cigsMax: 19,
      rangeMgMl: [9, 12],
      types: ["FREEBASE", "SALT"],
      note: "Classique (subohm) / sels (pod)",
    },
    {
      id: "gros_fumeur",
      cigsMin: 20,
      cigsMax: 99,
      rangeMgMl: [15, 18],
      types: ["SALT"],
      note: "Sels de nicotine — table boutique 16–18 mg, grille All Vap's 15–18",
    },
  ],
} as const;

export type NicotineType = "FREEBASE" | "SALT";
export type NicotineFamily = "NICOTINE_CLASSIQUE" | "SEL_DE_NICOTINE";

export function familyOf(type: NicotineType): NicotineFamily {
  return type === "SALT" ? "SEL_DE_NICOTINE" : "NICOTINE_CLASSIQUE";
}

export const NICOTINE_CLASSIC_FACTS = {
  hit_gorge: "Fort",
  sensation: "plus sèche / plus présente",
  usage: "vape classique, souvent matériel varié / subohm",
  absorption: "progressive — ne pas promettre une vitesse identique pour tous",
  compatibilite: "Tous, souvent associé au subohm",
  taux_max_confort_boutique: "12–16 mg/ml indicatif ; plafond All Vap's 15 mg/ml",
  pour_qui: "Souvent vapoteurs déjà à l'aise avec le hit",
  limite: "15 mg/ml",
} as const;

export const NICOTINE_SALT_FACTS = {
  hit_gorge: "Doux",
  sensation: "généralement plus douce",
  usage: "pods, basse puissance",
  absorption: "souvent perçue plus rapide — sans promesse physiologique exacte",
  compatibilite: "Pods / faible puissance",
  taux_max_confort_boutique: "20 mg/ml",
  pour_qui: "Souvent débutants ou gros fumeurs si le hit classique est trop agressif",
  limite: "20 mg/ml",
} as const;
