"use client";

/**
 * @deprecated Use useSpeechRecognition + useSpeechSynthesis + useVoiceConversation
 */
export {
  useSpeechRecognition,
  requestMicPermission,
} from "@/hooks/useSpeechRecognition";
export { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";
export {
  useVoiceConversation,
  avaStatusLabel,
  type AvaConversationState,
} from "@/hooks/useVoiceConversation";

import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";
import type { AvaConversationState } from "@/hooks/useVoiceConversation";

export type AvaVoiceState = AvaConversationState;

export function deriveAvaState(
  isListening: boolean,
  isSpeaking: boolean,
  isThinking: boolean
): AvaVoiceState {
  if (isListening) return "listening";
  if (isThinking) return "thinking";
  if (isSpeaking) return "speaking";
  return "idle";
}

/** Legacy combined hook */
export function useSpeech(onTranscript?: (text: string) => void) {
  const recognition = useSpeechRecognition(onTranscript);
  const synthesis = useSpeechSynthesis();

  return {
    isListening: recognition.isListening,
    isSpeaking: synthesis.isSpeaking,
    isSupported: recognition.canListen || synthesis.canSpeak,
    canListen: recognition.canListen,
    canSpeak: synthesis.canSpeak,
    transcript: recognition.transcript,
    interimTranscript: recognition.interimTranscript,
    error: recognition.error || synthesis.error,
    startListening: recognition.startListening,
    stopListening: recognition.stopListening,
    speak: synthesis.speak,
    stopSpeaking: synthesis.stopSpeaking,
    clearError: recognition.clearError,
  };
}
