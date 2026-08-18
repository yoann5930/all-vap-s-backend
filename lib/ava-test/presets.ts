import { emptyConversationContext } from "@/lib/ai/ava";
import type { AvaConversationContext } from "@/lib/ai/ava";
import {
  AVA_TEST_ACCOUNT_IDS,
  type AvaTestProfileInput,
  type AvaTestProfilePreset,
  type AvaTestSessionRecord,
} from "@/lib/ava-test/types";
import type { AvaExperienceLevel } from "@/lib/ava/advisor-policy";

function cravingToAllDay(freq: string | undefined): boolean | null {
  const t = (freq || "").trim().toUpperCase();
  if (!t) return null;
  if (t === "ALL_DAY" || t === "HIGH" || t === "TOUTE_LA_JOURNEE") return true;
  if (t === "OCCASIONAL" || t === "LOW" || t === "MORNING") return false;
  return null;
}

export function testAccountIdForPreset(preset: AvaTestProfilePreset): string {
  return AVA_TEST_ACCOUNT_IDS[preset];
}

export function applyPresetToContext(
  preset: AvaTestProfilePreset,
  profile: AvaTestProfileInput | undefined,
  previous?: AvaConversationContext,
): AvaConversationContext {
  const ctx = previous ? { ...previous } : emptyConversationContext();
  const cigs = profile?.cigarettesPerDay;
  const allDay = cravingToAllDay(profile?.cravingFrequency);
  const nic = profile?.nicotineMg;

  ctx.experienceLevel = preset;
  ctx.memoryLoaded = true;
  if (typeof cigs === "number" && cigs > 0) ctx.cigarettesPerDay = cigs;
  if (allDay != null) ctx.allDayNeed = allDay;
  if (typeof nic === "number" && nic >= 0) ctx.nicotineMg = nic;
  if (profile?.currentDeviceName) ctx.deviceModel = profile.currentDeviceName;
  return ctx;
}

export function newTestSession(params: {
  sessionId: string;
  preset: AvaTestProfilePreset;
  profile?: AvaTestProfileInput;
}): AvaTestSessionRecord {
  const now = new Date().toISOString();
  const profile = params.profile ?? {};
  const experienceLevel: AvaExperienceLevel = params.preset;
  const allDay = cravingToAllDay(profile.cravingFrequency);
  return {
    sessionId: params.sessionId,
    testAccountId: testAccountIdForPreset(params.preset),
    profilePreset: params.preset,
    profile,
    conversationContext: applyPresetToContext(params.preset, profile),
    cigarettesPerDay:
      typeof profile.cigarettesPerDay === "number" && profile.cigarettesPerDay > 0
        ? profile.cigarettesPerDay
        : null,
    allDayNeed: allDay,
    cigaretteType: profile.cigaretteType ? String(profile.cigaretteType) : null,
    nicotineMg: typeof profile.nicotineMg === "number" ? profile.nicotineMg : null,
    yearsVaping: typeof profile.yearsVaping === "number" ? profile.yearsVaping : null,
    currentDeviceName: profile.currentDeviceName ?? null,
    experienceLevel,
    turnCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}
