import type { MicPermissionStatus } from "@/lib/ai/mic-permission";

export type MicModalVisibilityInput = {
  pauseListening: boolean;
  micModalDismissed: boolean;
  micPermission: MicPermissionStatus;
  isPromptingMic: boolean;
  micActive: boolean;
  voiceState: string;
};

/** Affiche la modale micro uniquement quand le consentement est vraiment requis. */
export function shouldShowMicModal(input: MicModalVisibilityInput): boolean {
  if (input.pauseListening || input.micModalDismissed) return false;
  if (input.micPermission === "granted" || input.micActive) return false;

  return (
    input.isPromptingMic ||
    input.micPermission === "prompting" ||
    input.micPermission === "unsupported" ||
    (input.micPermission === "unknown" &&
      input.voiceState === "REQUESTING_PERMISSION") ||
    input.micPermission === "denied"
  );
}
