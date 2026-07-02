"use client";

import { motion } from "framer-motion";
import { Mic, MicOff } from "lucide-react";
import type { AvaVoiceState } from "@/hooks/useSpeech";

interface VoiceControlsProps {
  onTranscript?: (text: string) => void;
  lastAssistantMessage?: string;
  voiceEnabled?: boolean;
  onToggleVoice?: () => void;
  disabled?: boolean;
}

/** Compact controls — legacy ChatWindow */
export function VoiceControls(_props: VoiceControlsProps) {
  return null;
}

interface ImmersiveMicProps {
  state: AvaVoiceState;
  disabled?: boolean;
  onToggle: () => void;
}

export function ImmersiveMic({ state, disabled, onToggle }: ImmersiveMicProps) {
  const isListening = state === "listening";
  const isSpeaking = state === "speaking";
  const isThinking = state === "thinking";

  return (
    <motion.button
      type="button"
      onClick={onToggle}
      disabled={disabled || isSpeaking || isThinking}
      aria-label={isListening ? "Arrêter le micro" : "Parler à A.V.A."}
      className="relative flex h-16 w-16 items-center justify-center rounded-full focus:outline-none disabled:opacity-40"
      whileHover={{ scale: disabled ? 1 : 1.06 }}
      whileTap={{ scale: disabled ? 1 : 0.94 }}
      animate={
        isListening
          ? {
              boxShadow: [
                "0 0 24px rgba(0,212,255,0.4)",
                "0 0 48px rgba(0,212,255,0.75)",
                "0 0 24px rgba(0,212,255,0.4)",
              ],
            }
          : { boxShadow: "0 0 20px rgba(0,212,255,0.15)" }
      }
      transition={{ duration: 1, repeat: isListening ? Infinity : 0 }}
    >
      {isListening && (
        <>
          <motion.span
            className="absolute inset-0 rounded-full border-2 border-cyan-400/50"
            animate={{ scale: [1, 1.4, 1], opacity: [0.8, 0, 0.8] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          <motion.span
            className="absolute inset-[-10px] rounded-full border border-cyan-500/30"
            animate={{ scale: [1, 1.55, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, delay: 0.25 }}
          />
        </>
      )}

      <span
        className={`relative flex h-14 w-14 items-center justify-center rounded-full border transition-colors ${
          isListening
            ? "border-cyan-300 bg-cyan-500/30 text-cyan-100"
            : "border-cyan-600/40 bg-cyan-950/50 text-cyan-400/80 hover:border-cyan-500/60 hover:text-cyan-300"
        }`}
      >
        {isListening ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
      </span>
    </motion.button>
  );
}
