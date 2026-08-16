export { NICOTINE_CONFIG, familyOf, NICOTINE_CLASSIC_FACTS, NICOTINE_SALT_FACTS } from "./config";
export type { NicotineType, NicotineFamily } from "./config";
export {
  mixNicotine,
  roundMgMl,
  isAllowedTarget,
  maxMgMl,
  commercialTargetAllVaps,
  formatMixSpoken,
} from "./calculator";
export { recommendNicotineProfile, evaluateRequestedStrength } from "./recommend";
export { classifyDevice, saltHighDoseNeedsDevice, DEVICE_QUESTIONS } from "./device-guard";
export {
  isNicotineConversation,
  parseMixRequest,
  extractProfileHints,
} from "./extract";
export { continueNicotineDialogue, startNicotineDialogue } from "./dialogue";
export {
  lookupConsumptionEstimate,
  lookupSmokerProfile,
  spokenConsumption,
  spokenTypeComparison,
  spokenSmokerProfileHint,
} from "./tables";
export type {
  NicotineProfileInput,
  NicotineRecommendation,
  MixInput,
  MixResult,
  NicotineInterviewState,
} from "./types";
export type { NicotineTurn } from "./dialogue";
