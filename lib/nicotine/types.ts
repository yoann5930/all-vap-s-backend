import type { NicotineType } from "./config";

export type CravingLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH";
export type ThroatHit = "TOO_SOFT" | "GOOD" | "TOO_STRONG";
export type RecommendationStatus =
  | "OK"
  | "KEEP_CURRENT"
  | "CONSIDER_SALT"
  | "INCREASE_PROGRESSIVE"
  | "REDUCE_OR_PAUSE"
  | "BLOCKED_OVER_LIMIT"
  | "BLOCKED_NON_SMOKER"
  | "BLOCKED_PENDING_DEVICE_INFO"
  | "NEED_MORE_INFO";

export type NicotineProfileInput = {
  adult: boolean;
  smoker: boolean;
  vaper?: boolean;
  cigarettesPerDay?: number;
  firstCigaretteAfterWakeMinutes?: number;
  currentNicotineMg?: number;
  currentNicotineType?: NicotineType;
  cravings?: CravingLevel;
  throatHit?: ThroatHit;
  deviceType?: string;
  resistanceOhm?: number;
  powerWatts?: number;
  inhalationType?: string;
  vapingFrequency?: string;
  symptoms?: string[];
  wantsReduction?: boolean;
  tobaccoReplaced?: boolean;
};

export type NicotineRecommendation = {
  recommendedType: NicotineType | null;
  recommendedRange: number[];
  commercialTargetMgMl?: number | null;
  confidence: "low" | "medium" | "high";
  reasons: string[];
  warnings: string[];
  questionsNeeded: string[];
  status: RecommendationStatus;
  spoken: string;
};

export type MixInput = {
  baseVolumeMl: number;
  boosterVolumeMl: number;
  boosterStrengthMgMl: number;
  boosterCount: number;
  nicotineType: NicotineType;
};

export type MixResult = {
  finalVolumeMl: number;
  totalNicotineMg: number;
  actualMgMl: number;
  commercialTargetMgMl: number | null;
  overFreebaseLimit: boolean;
  overSaltLimit: boolean;
  freebaseBoosterCapExceeded: boolean;
  alert: string | null;
};

export type NicotineInterviewState = {
  input: Partial<NicotineProfileInput> & { adult?: boolean };
  asked: string[];
  lastSpoken?: string;
};
