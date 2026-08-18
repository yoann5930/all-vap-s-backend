import { beginnerNicotineOrientation } from "@/lib/ava/beginner-nicotine-speak";
import type { AvaExperienceLevel } from "@/lib/ava/advisor-policy";
import type { AvaTestNicotineDecision, AvaTestSessionRecord } from "@/lib/ava-test/types";

function mapReasonCodes(
  rec: { reasons?: string[] },
  cigs: number | null,
  allDay: boolean | null,
): string[] {
  const codes = new Set<string>();
  if (cigs != null && cigs >= 15) codes.add("HIGH_CONSUMPTION");
  if (allDay === true) codes.add("ALL_DAY_NEED");
  for (const r of rec.reasons || []) {
    const u = r.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (u) codes.add(u);
  }
  return [...codes];
}

export function nicotineDecisionFromSession(
  session: AvaTestSessionRecord,
  experienceLevel: AvaExperienceLevel,
): AvaTestNicotineDecision | null {
  const used = session.nicotineMg;
  if (experienceLevel === "EXPERT" || experienceLevel === "AUTONOMOUS") {
    if (used == null && session.cigarettesPerDay == null) return null;
    return {
      rangeMin: used ?? null,
      rangeMax: used ?? null,
      form: null,
      reasonCodes: used != null ? ["EXPERT_KNOWN_RATE"] : [],
      usedNicotineMg: used ?? null,
    };
  }

  const cigs = session.cigarettesPerDay;
  if (cigs == null || cigs <= 0) return null;

  const { recommendation } = beginnerNicotineOrientation({
    cigarettesPerDay: cigs,
    allDayNeed: session.allDayNeed === true,
    deviceKind: "pod",
    hasSelectedDevice: Boolean(session.currentDeviceName),
  });
  const range = recommendation.recommendedRange || [];
  const form = recommendation.recommendedType === "SALT"
    ? "SALT"
    : recommendation.recommendedType === "FREEBASE"
      ? "FREEBASE"
      : null;
  return {
    rangeMin: range[0] ?? null,
    rangeMax: range[range.length - 1] ?? range[0] ?? null,
    form,
    reasonCodes: mapReasonCodes(recommendation, cigs, session.allDayNeed),
    usedNicotineMg: used ?? null,
  };
}
