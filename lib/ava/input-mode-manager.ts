/**
 * Modes d'entrée AVA — session uniquement (pas de persistance sans consentement).
 */
export type AvaInputMode =
  | "VOICE_ACTIVE"
  | "VOICE_PERMISSION_REQUIRED"
  | "VOICE_PERMISSION_DENIED"
  | "VOICE_UNAVAILABLE"
  | "VOICE_NO_SIGNAL"
  | "TEXT_FALLBACK"
  | "ACCESSIBILITY_MODE";

export type PreferredCommMode = "voice" | "text" | "mixed";

export type InputModeState = {
  mode: AvaInputMode;
  preferred: PreferredCommMode;
  /** Client a suspendu volontairement l'écoute (accessibilité) */
  listeningPausedByUser: boolean;
  emptyRecognitionCount: number;
  silencePrompts: number;
  lastUserInputAt: number | null;
};

export function createInitialInputModeState(
  partial?: Partial<InputModeState>
): InputModeState {
  return {
    mode: "VOICE_PERMISSION_REQUIRED",
    preferred: "mixed",
    listeningPausedByUser: false,
    emptyRecognitionCount: 0,
    silencePrompts: 0,
    lastUserInputAt: null,
    ...partial,
  };
}

export function resolveInputMode(params: {
  canListen: boolean;
  micPermission: string;
  listeningPausedByUser: boolean;
  forceText?: boolean;
  noSignal?: boolean;
}): AvaInputMode {
  if (params.forceText || params.listeningPausedByUser) {
    return params.listeningPausedByUser ? "ACCESSIBILITY_MODE" : "TEXT_FALLBACK";
  }
  if (!params.canListen || params.micPermission === "unsupported") {
    return "VOICE_UNAVAILABLE";
  }
  if (params.micPermission === "denied") return "VOICE_PERMISSION_DENIED";
  if (params.micPermission === "prompting" || params.micPermission === "unknown") {
    return "VOICE_PERMISSION_REQUIRED";
  }
  if (params.noSignal) return "VOICE_NO_SIGNAL";
  if (params.micPermission === "granted") return "VOICE_ACTIVE";
  return "VOICE_PERMISSION_REQUIRED";
}

export function recordUserSpoke(state: InputModeState): InputModeState {
  return {
    ...state,
    preferred: state.preferred === "text" ? "mixed" : "voice",
    emptyRecognitionCount: 0,
    silencePrompts: 0,
    lastUserInputAt: Date.now(),
  };
}

export function recordUserTyped(state: InputModeState): InputModeState {
  return {
    ...state,
    preferred: state.preferred === "voice" ? "mixed" : "text",
    lastUserInputAt: Date.now(),
  };
}

export function recordEmptyRecognition(state: InputModeState): InputModeState {
  return {
    ...state,
    emptyRecognitionCount: state.emptyRecognitionCount + 1,
  };
}

export function shouldAutoOpenText(state: InputModeState): boolean {
  return state.emptyRecognitionCount >= 2 || state.silencePrompts >= 2;
}

export function conversationStatusLabel(
  mode: AvaInputMode,
  phase: "listening" | "thinking" | "speaking" | "idle"
): string {
  if (mode === "TEXT_FALLBACK" || mode === "ACCESSIBILITY_MODE") {
    return "Mode texte activé";
  }
  if (mode === "VOICE_PERMISSION_REQUIRED") return "Autorisation micro…";
  if (mode === "VOICE_PERMISSION_DENIED") return "Mode texte activé";
  if (mode === "VOICE_UNAVAILABLE") return "Mode texte activé";
  if (mode === "VOICE_NO_SIGNAL") return "Vous pouvez aussi m'écrire";
  if (phase === "listening") return "AVA vous écoute";
  if (phase === "thinking") return "AVA réfléchit";
  if (phase === "speaking") return "AVA vous répond";
  return "AVA est disponible";
}
