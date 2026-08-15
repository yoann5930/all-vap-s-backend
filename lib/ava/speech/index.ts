export { AvaSpeechNormalizer, normalizeOralFrench } from "./ava-speech-normalizer";
export { understandUtterance, emitUnderstandLogs } from "./understand";
export { applyPhoneticCorrections } from "./phonetic-corrector";
export { detectSpeechLanguage } from "./language";
export { editDistance, phoneticKey, similarEnough } from "./fuzzy";
export { recordComprehensionPattern, getComprehensionStats } from "./comprehension-stats";
export type {
  SpeechUnderstanding,
  SpeechIntent,
  SpeechUnderstandOptions,
} from "./types";
