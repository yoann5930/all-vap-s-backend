/**
 * Passerelle de test AVA — types internes uniquement.
 * Jamais exposés au frontend public.
 */

import type { AvaConversationContext } from "@/lib/ai/ava";
import type { AvaExperienceLevel } from "@/lib/ava/advisor-policy";

export const AVA_TEST_MODE = "AVA_TEST_MODE" as const;

export const AVA_TEST_PRESETS = ["BEGINNER", "GUIDED", "EXPERT"] as const;
export type AvaTestProfilePreset = (typeof AVA_TEST_PRESETS)[number];

export const AVA_TEST_ACCOUNT_IDS = {
  BEGINNER: "AVA_TEST_BEGINNER",
  GUIDED: "AVA_TEST_GUIDED",
  EXPERT: "AVA_TEST_EXPERT",
} as const;

export type AvaTestCigaretteType = "TUBES" | "PACK" | "ROLLING" | "UNKNOWN";
export type AvaTestCravingFrequency = "ALL_DAY" | "OCCASIONAL" | "MORNING" | "UNKNOWN";

export type AvaTestProfileInput = {
  cigarettesPerDay?: number;
  cigaretteType?: AvaTestCigaretteType | string;
  cravingFrequency?: AvaTestCravingFrequency | string;
  nicotineMg?: number;
  yearsVaping?: number;
  currentDeviceName?: string;
};

export type AvaTestTurnRequest = {
  sessionId: string;
  message: string;
  profilePreset?: AvaTestProfilePreset;
  profile?: AvaTestProfileInput;
};

export type AvaTestNicotineDecision = {
  rangeMin: number | null;
  rangeMax: number | null;
  form: "SALT" | "FREEBASE" | null;
  reasonCodes: string[];
  usedNicotineMg: number | null;
};

export type AvaTestRecommendedProduct = {
  id: string;
  name: string;
  slug: string;
  primary: boolean;
  available: boolean;
  imageUrl: string | null;
  url: string;
};

export type AvaTestTtsInfo = {
  queued: boolean;
  segments: number;
  segmentsExpected: number;
  segmentsQueued: number;
  completed: boolean;
};

export type AvaTestEvent =
  | "BEGINNER_DETECTED"
  | "GUIDED_DETECTED"
  | "EXPERT_DETECTED"
  | "MEMORY_LOADED"
  | "CONSUMPTION_CAPTURED"
  | "RECOMMEND_NOW"
  | "NICOTINE_CALCULATED"
  | "DEVICE_RECOMMENDED"
  | "TTS_QUEUED";

export type AvaTestOkResponse = {
  ok: true;
  sessionId: string;
  avaText: string;
  intent: string;
  experienceLevel: AvaExperienceLevel;
  memoryLoaded: boolean;
  nicotineDecision: AvaTestNicotineDecision | null;
  recommendedProducts: AvaTestRecommendedProduct[];
  tts: AvaTestTtsInfo;
  events: AvaTestEvent[];
  testAccountId: string;
  diagnostics: {
    route: string;
    engine: string;
    latencyMs: number;
    testMode: typeof AVA_TEST_MODE;
    writeScope: "READ_PLUS_SIMULATE";
    sessionResumeToken: string;
  };
};

export type AvaTestErrorCode =
  | "AVA_TEST_DISABLED"
  | "AVA_TEST_UNAUTHORIZED"
  | "AVA_TEST_RATE_LIMITED"
  | "AVA_TEST_INVALID_REQUEST"
  | "AVA_TEST_INVALID_SESSION"
  | "AVA_TEST_SESSION_NOT_FOUND"
  | "AVA_TEST_ENGINE_ERROR";

export type AvaTestErrorResponse = {
  ok: false;
  errorCode: AvaTestErrorCode;
  message: string;
};

export type AvaTestResponse = AvaTestOkResponse | AvaTestErrorResponse;

export type AvaTestSessionRecord = {
  sessionId: string;
  testAccountId: string;
  profilePreset: AvaTestProfilePreset;
  profile: AvaTestProfileInput;
  conversationContext: AvaConversationContext;
  cigarettesPerDay: number | null;
  allDayNeed: boolean | null;
  cigaretteType: string | null;
  nicotineMg: number | null;
  yearsVaping: number | null;
  currentDeviceName: string | null;
  experienceLevel: AvaExperienceLevel;
  turnCount: number;
  createdAt: string;
  updatedAt: string;
};
