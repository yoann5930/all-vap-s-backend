/**
 * Types notices matériels All Vap's.
 */
export type VapeDeviceCategory =
  | "pod"
  | "box"
  | "kit"
  | "clearomiseur"
  | "atomiseur"
  | "cartouche"
  | "batterie"
  | "chargeur"
  | "accessoire";

export type VerificationStatus =
  | "OFFICIAL_CONFIRMED"
  | "OFFICIAL_PARTIAL"
  | "NEEDS_CONFIRMATION"
  | "NEEDS_OFFICIAL_DATA"
  | "DISCONTINUED";

export type VapeDeviceManual = {
  manufacturer: string;
  manufacturerSlug: string;
  model: string;
  modelSlug: string;
  aliases: string[];
  category: VapeDeviceCategory;
  officialProductUrl?: string;
  officialManualUrl?: string;
  officialSupportUrl?: string;
  verifiedAt: string;
  verificationStatus: VerificationStatus;
  images: {
    front?: string;
    back?: string;
    side?: string;
    bottom?: string;
    screen?: string;
    cartridge?: string;
    ports?: string;
  };
  distinguishingFeatures?: string[];
  technicalSpecs: {
    batteryType?: string;
    batteryCapacityMah?: number;
    removableBattery?: boolean;
    compatibleBatteryFormat?: string[];
    chargingPort?: string;
    chargingPower?: string;
    powerRangeW?: string;
    resistanceRangeOhm?: string;
    tankCapacityMl?: number;
    activationModes?: string[];
    chipset?: string;
    dimensions?: string;
  };
  controls: {
    powerOn?: string;
    powerOff?: string;
    lockUnlock?: string;
    wattageAdjustment?: string;
    menuAccess?: string;
    resetPuffCounter?: string;
    changeMode?: string;
    screenBrightness?: string;
  };
  compatiblePods?: string[];
  compatibleCartridges?: string[];
  compatibleCoils?: Array<{
    name: string;
    resistanceOhm?: number;
    recommendedWattage?: string;
    usageType?: string;
    officialSource?: string;
  }>;
  fillingProcedure?: string[];
  coilReplacementProcedure?: string[];
  podReplacementProcedure?: string[];
  primingProcedure?: string[];
  cleaningProcedure?: string[];
  chargingProcedure?: string[];
  errorMessages?: Array<{
    display: string;
    meaning: string;
    safeChecks: string[];
    stopConditions?: string[];
  }>;
  commonProblems?: Array<{
    intent: string;
    symptoms: string[];
    safeDiagnosisSteps: string[];
    possibleCauses: string[];
    safeSolutions: string[];
    requiresShopInspection?: boolean;
  }>;
  safetyWarnings: string[];
};
