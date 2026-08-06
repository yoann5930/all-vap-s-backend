/**
 * Sécurité matérielle — priorité absolue sur le diagnostic.
 */
import { detectHardwareIntent } from "@/lib/ava/hardware-intent-detector";
import { pickPhrase } from "@/lib/ava/conversation-style";

export const SAFETY_STOP_MESSAGE = pickPhrase("safety");

export const FORBIDDEN_ADVICE = [
  "ouvrir une batterie intégrée",
  "démonter un accu",
  "percer une batterie",
  "contourner une sécurité",
  "modifier le firmware",
  "shunter un contact",
  "souder",
  "utiliser un accu abîmé",
  "forcer une résistance incompatible",
  "réparer un appareil sous tension",
] as const;

export type SafetyCheckResult = {
  danger: boolean;
  stopDiagnostic: boolean;
  message: string | null;
  matched: string[];
};

export function checkHardwareSafety(message: string): SafetyCheckResult {
  const intent = detectHardwareIntent(message);
  if (!intent.isDanger) {
    return { danger: false, stopDiagnostic: false, message: null, matched: [] };
  }
  return {
    danger: true,
    stopDiagnostic: true,
    message: SAFETY_STOP_MESSAGE,
    matched: intent.matchedDanger,
  };
}

export function isForbiddenRepairAdvice(text: string): boolean {
  const t = text.toLowerCase();
  return FORBIDDEN_ADVICE.some((f) => t.includes(f.split(" ")[0]) && /démonter|percer|shunter|souder|firmware|contourner/.test(t));
}
