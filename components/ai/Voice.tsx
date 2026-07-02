"use client";

import { Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { useSpeech } from "@/hooks/useSpeech";

interface VoiceControlsProps {
  onTranscript: (text: string) => void;
  lastAssistantMessage?: string;
  voiceEnabled: boolean;
  onToggleVoice: () => void;
  disabled?: boolean;
}

export function VoiceControls({
  onTranscript,
  lastAssistantMessage,
  voiceEnabled,
  onToggleVoice,
  disabled,
}: VoiceControlsProps) {
  const { isListening, isSpeaking, isSupported, startListening, stopListening, speak, stopSpeaking, error } =
    useSpeech(onTranscript);

  const handleMic = () => {
    if (isListening) stopListening();
    else startListening();
  };

  const handleSpeaker = () => {
    if (isSpeaking) {
      stopSpeaking();
      return;
    }
    if (lastAssistantMessage && voiceEnabled) {
      speak(lastAssistantMessage);
    }
  };

  if (!isSupported) {
    return (
      <p className="text-[10px] text-cyan-400/40">
        Voix : compatible navigateur (Web Speech API). Clé OpenAI Voice prête pour extension future.
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleMic}
        disabled={disabled}
        aria-label={isListening ? "Arrêter le micro" : "Parler au micro"}
        className={`flex h-9 w-9 items-center justify-center rounded-xl border transition will-change-transform ${
          isListening
            ? "border-cyan-400 bg-cyan-500/20 text-cyan-300 shadow-[0_0_16px_rgba(0,212,255,0.4)]"
            : "border-cyan-500/30 bg-black/40 text-cyan-400/80 hover:border-cyan-400/50"
        } disabled:opacity-40`}
      >
        {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </button>

      <button
        type="button"
        onClick={() => {
          onToggleVoice();
          if (voiceEnabled) stopSpeaking();
        }}
        aria-label={voiceEnabled ? "Désactiver la voix" : "Activer la voix"}
        className={`flex h-9 w-9 items-center justify-center rounded-xl border transition ${
          voiceEnabled
            ? "border-cyan-500/40 text-cyan-300"
            : "border-white/10 text-gray-500"
        }`}
      >
        {voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
      </button>

      {voiceEnabled && lastAssistantMessage && (
        <button
          type="button"
          onClick={handleSpeaker}
          disabled={disabled}
          className="text-[10px] text-cyan-400/70 underline-offset-2 hover:text-cyan-300 hover:underline"
        >
          {isSpeaking ? "Arrêter" : "Écouter"}
        </button>
      )}

      {error && <span className="text-[10px] text-red-400/80">{error}</span>}
    </div>
  );
}
