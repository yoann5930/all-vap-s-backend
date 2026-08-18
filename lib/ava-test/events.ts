import {
  decideAdvisorAction,
  advisorStateFromMemory,
} from "@/lib/ava/advisor-decision";
import {
  detectAllDayNeed,
  detectExperienceFromMessage,
  isDeviceRecommendationIntent,
  isNicotineStrengthQuestion,
  parseCigarettesPerDay,
  type AvaExperienceLevel,
} from "@/lib/ava/advisor-policy";
import { emptyCustomerMemory } from "@/lib/ava/customer-memory";
import type { AvaTestEvent, AvaTestSessionRecord } from "@/lib/ava-test/types";

export function collectTestEvents(params: {
  session: AvaTestSessionRecord;
  message: string;
  experienceLevel: AvaExperienceLevel;
  memoryLoaded: boolean;
  productCount: number;
  nicotineCalculated: boolean;
  ttsQueued: boolean;
}): AvaTestEvent[] {
  const events: AvaTestEvent[] = [];
  if (params.experienceLevel === "BEGINNER") events.push("BEGINNER_DETECTED");
  if (params.experienceLevel === "GUIDED") events.push("GUIDED_DETECTED");
  if (params.experienceLevel === "EXPERT") events.push("EXPERT_DETECTED");
  if (params.memoryLoaded) events.push("MEMORY_LOADED");
  if (
    parseCigarettesPerDay(params.message) != null ||
    params.session.cigarettesPerDay != null
  ) {
    events.push("CONSUMPTION_CAPTURED");
  }
  if (isDeviceRecommendationIntent(params.message) || params.productCount > 0) {
    events.push("RECOMMEND_NOW");
  }
  if (params.nicotineCalculated || isNicotineStrengthQuestion(params.message)) {
    events.push("NICOTINE_CALCULATED");
  }
  if (params.productCount > 0) events.push("DEVICE_RECOMMENDED");
  if (params.ttsQueued) events.push("TTS_QUEUED");
  return [...new Set(events)];
}

export function resolveTestIntent(session: AvaTestSessionRecord, message: string): string {
  const memory = emptyCustomerMemory({
    experienceLevel: session.experienceLevel,
    cigarettesPerDay: session.cigarettesPerDay,
    allDayNeed: session.allDayNeed,
    usedNicotineMg: session.nicotineMg,
    currentDeviceName: session.currentDeviceName,
  });
  const cigs = parseCigarettesPerDay(message);
  if (cigs) memory.cigarettesPerDay = cigs;
  const allDay = detectAllDayNeed(message);
  if (allDay != null) memory.allDayNeed = allDay;
  memory.experienceLevel = detectExperienceFromMessage(message, memory.experienceLevel);
  const state = advisorStateFromMemory(memory, message);
  return decideAdvisorAction(state, message);
}
