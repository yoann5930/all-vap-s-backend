import { handleAvaTestPost } from "@/lib/ava-test/http";
import { AVA_MOBILE_TEST_USER } from "@/lib/ava-device/types";
import { avaDeviceLog } from "@/lib/ava-device/log";

const BEGINNER_MESSAGES = [
  "Bonjour, je voudrais commencer la cigarette électronique mais je n’y connais absolument rien.",
  "Je fume environ 20 cigarettes par jour.",
  "Je fais des tubes.",
  "J’ai envie de fumer toute la journée.",
  "Je veux le meilleur matériel pour arrêter de fumer, mais je ne sais pas du tout quoi choisir.",
  "Et je dois prendre combien en nicotine ?",
];

export async function runBeginnerScenarioOnServer(params: {
  operatorAuthorization: string;
  sessionId: string;
}): Promise<{ ok: boolean; turns: number; lastText: string; error?: string }> {
  let turns = 0;
  let lastText = "";
  for (const message of BEGINNER_MESSAGES) {
    const r = await handleAvaTestPost({
      authorization: params.operatorAuthorization,
      ip: "ava-device-scenario",
      body: {
        sessionId: params.sessionId,
        message,
        profilePreset: "BEGINNER",
        profile: {
          cigarettesPerDay: 20,
          cigaretteType: "TUBES",
          cravingFrequency: "ALL_DAY",
        },
      },
    });
    turns += 1;
    if (!r.body.ok) {
      avaDeviceLog("scenario_ava_test_error", { result: "error" });
      return { ok: false, turns, lastText, error: r.body.errorCode };
    }
    lastText = r.body.avaText;
  }
  avaDeviceLog("scenario_beginner", {
    result: "ok",
    turns,
    user: AVA_MOBILE_TEST_USER,
  });
  return { ok: true, turns, lastText };
}

export function mobileTestSessionId(): string {
  return `demo-mobile-${Date.now().toString(36)}`;
}
