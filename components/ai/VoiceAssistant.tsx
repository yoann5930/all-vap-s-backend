"use client";

import { motion } from "framer-motion";
import { Mic, MicOff } from "lucide-react";
import type { AvaConversationState } from "@/hooks/useVoiceConversation";

interface VoiceAssistantProps {
  state: AvaConversationState;
  disabled?: boolean;
  onToggleMic: () => void;
}

export function VoiceAssistant({ state, disabled, onToggleMic }: VoiceAssistantProps) {
  const isListening = state === "listening";
  const isSpeaking = state === "speaking";
  const isThinking = state === "thinking";

  return (
    <motion.button
      type="button"
      onClick={onToggleMic}
      disabled={disabled || isSpeaking || isThinking}
      aria-label={isListening ? "Arrêter le micro" : "Parler à A.V.A."}
      className="relative flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full focus:outline-none disabled:opacity-35"
      whileHover={{ scale: disabled ? 1 : 1.05 }}
      whileTap={{ scale: disabled ? 1 : 0.95 }}
      animate={
        isListening
          ? {
              boxShadow: [
                "0 0 30px rgba(0,212,255,0.35)",
                "0 0 60px rgba(0,212,255,0.7)",
                "0 0 30px rgba(0,212,255,0.35)",
              ],
            }
          : { boxShadow: "0 0 28px rgba(0,212,255,0.18)" }
      }
      transition={{ duration: 1.1, repeat: isListening ? Infinity : 0 }}
    >
      {isListening && (
        <>
          <motion.span
            className="absolute inset-0 rounded-full border-2 border-cyan-300/50"
            animate={{ scale: [1, 1.45, 1], opacity: [0.85, 0, 0.85] }}
            transition={{ duration: 1.4, repeat: Infinity }}
          />
          <motion.span
            className="absolute inset-[-12px] rounded-full border border-cyan-400/25"
            animate={{ scale: [1, 1.6, 1], opacity: [0.55, 0, 0.55] }}
            transition={{ duration: 1.9, repeat: Infinity, delay: 0.2 }}
          />
        </>
      )}

      <span
        className={`relative flex h-[3.75rem] w-[3.75rem] items-center justify-center rounded-full border backdrop-blur-sm transition-colors ${
          isListening
            ? "border-cyan-200/70 bg-cyan-400/25 text-cyan-50"
            : "border-cyan-500/35 bg-cyan-950/40 text-cyan-300/85 hover:border-cyan-400/55 hover:text-cyan-100"
        }`}
      >
        {isListening ? <MicOff className="h-7 w-7" strokeWidth={1.5} /> : <Mic className="h-7 w-7" strokeWidth={1.5} />}
      </span>
    </motion.button>
  );
}
