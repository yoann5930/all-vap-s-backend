/**
 * Décision unique du conseiller AVA — un seul cerveau.
 * Priorité : demande explicite > infos indispensables manquantes > préférences.
 */
import {
  beginnerHasEnoughForFirstDevice,
  detectAllDayNeed,
  isDeviceRecommendationIntent,
  parseCigarettesPerDay,
  type AvaExperienceLevel,
} from "@/lib/ava/advisor-policy";
import type { AvaCustomerMemory } from "@/lib/ava/customer-memory";

export type AdvisorAction =
  | "ASK_SMOKES"
  | "ASK_CIGS"
  | "ASK_ALLDAY"
  | "SHOW_DEVICE_RECOMMENDATIONS"
  | "ORIENT_NICOTINE"
  | "ORIENT_FLAVOR"
  | "SHOW_DEVICE_GUIDE"
  | "FREE_EXPERT"
  | "UPDATE_MEMORY"
  | "CONTINUE";

export type AdvisorState = {
  experienceLevel: AvaExperienceLevel;
  intent: string;
  cigarettesPerDay: number | null;
  allDayNeed: boolean | null;
  selectedDeviceName: string | null;
  memoryLoaded: boolean;
};

export function advisorStateFromMemory(
  memory: AvaCustomerMemory,
  message: string,
): AdvisorState {
  const cigs = parseCigarettesPerDay(message) ?? memory.cigarettesPerDay;
  const allDay = detectAllDayNeed(message) ?? memory.allDayNeed;
  return {
    experienceLevel: memory.experienceLevel,
    intent: isDeviceRecommendationIntent(message)
      ? "DEVICE_RECOMMENDATION"
      : "GENERAL",
    cigarettesPerDay: cigs,
    allDayNeed: allDay,
    selectedDeviceName: memory.selectedDeviceName,
    memoryLoaded: true,
  };
}

export function missingBeginnerFields(state: AdvisorState): string[] {
  const missing: string[] = [];
  if (state.cigarettesPerDay == null || state.cigarettesPerDay <= 0) missing.push("cigarettesPerDay");
  if (state.allDayNeed == null) missing.push("allDayNeed");
  return missing;
}

export function decideAdvisorAction(
  state: AdvisorState,
  message: string,
): AdvisorAction {
  if (state.experienceLevel === "EXPERT" || state.experienceLevel === "AUTONOMOUS") {
    if (/je debut|debutant|premiere vape/.test(message.toLowerCase())) {
      return "ASK_SMOKES";
    }
    return "FREE_EXPERT";
  }

  const enough = beginnerHasEnoughForFirstDevice({
    cigsPerDay: state.cigarettesPerDay != null ? String(state.cigarettesPerDay) : "",
    allDay: state.allDayNeed === true ? "yes" : state.allDayNeed === false ? "no" : "",
  });

  if (isDeviceRecommendationIntent(message) && (enough || state.cigarettesPerDay)) {
    return "SHOW_DEVICE_RECOMMENDATIONS";
  }
  if (enough) return "SHOW_DEVICE_RECOMMENDATIONS";

  const missing = missingBeginnerFields(state);
  if (missing.includes("cigarettesPerDay")) return "ASK_CIGS";
  if (missing.includes("allDayNeed")) return "ASK_ALLDAY";
  return "CONTINUE";
}
