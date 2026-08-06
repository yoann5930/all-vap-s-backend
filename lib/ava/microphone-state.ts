/**
 * États microphone — détection sans contourner le consentement navigateur.
 */
import {
  isSpeechRecognitionSupported,
  queryMicPermission,
  type MicPermissionStatus,
} from "@/lib/ai/mic-permission";

export type MicHardwareState =
  | "ok"
  | "none"
  | "busy"
  | "denied"
  | "unsupported"
  | "unknown";

export async function detectMicrophoneState(): Promise<{
  recognitionSupported: boolean;
  permission: MicPermissionStatus;
  hardware: MicHardwareState;
}> {
  const recognitionSupported = isSpeechRecognitionSupported();
  if (!recognitionSupported) {
    return {
      recognitionSupported: false,
      permission: "unsupported",
      hardware: "unsupported",
    };
  }

  const permission = await queryMicPermission();

  if (permission === "denied") {
    return { recognitionSupported, permission, hardware: "denied" };
  }

  // Enumerate devices (sans stream) pour savoir s'il y a un micro
  try {
    if (navigator.mediaDevices?.enumerateDevices) {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasMic = devices.some((d) => d.kind === "audioinput");
      if (!hasMic) {
        return { recognitionSupported, permission, hardware: "none" };
      }
    }
  } catch {
    /* ignore */
  }

  return {
    recognitionSupported,
    permission,
    hardware: permission === "granted" ? "ok" : "unknown",
  };
}

export function micBusyMessage(): string {
  return "Le micro semble utilisé par une autre application. Vous pouvez m'écrire en attendant.";
}
