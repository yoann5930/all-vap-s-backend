import { AVA_MOBILE_TEST_USER } from "@/lib/ava-device/types";
import { avaDeviceLog } from "@/lib/ava-device/log";

/**
 * Le pont Samsung reste volontairement isolé du moteur de test AVA complet.
 * Le scénario conversationnel sera rebranché quand le noyau AVA sera validé
 * séparément. Les commandes appareil (dont DEVICE_STATUS) n'en dépendent pas.
 */
export async function runBeginnerScenarioOnServer(params: {
  operatorAuthorization: string;
  sessionId: string;
}): Promise<{ ok: boolean; turns: number; lastText: string; error?: string }> {
  void params.operatorAuthorization;
  avaDeviceLog("scenario_server_unavailable", {
    result: "disabled",
    user: AVA_MOBILE_TEST_USER,
    session: params.sessionId,
  });
  return {
    ok: false,
    turns: 0,
    lastText: "",
    error: "AVA_SCENARIO_ENGINE_NOT_INSTALLED",
  };
}

export function mobileTestSessionId(): string {
  return `demo-mobile-${Date.now().toString(36)}`;
}
