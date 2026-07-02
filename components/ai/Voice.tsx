"use client";

import { motion } from "framer-motion";
import { Mic, MicOff } from "lucide-react";
import { useSpeech } from "@/hooks/useSpeech";

interface VoiceControlsProps {
  onTranscript: (text: string) => void;
  lastAssistantMessage?: string;
  voiceEnabled: boolean;
  onToggleVoice: () => void;
  disabled?: boolean;
}

/** Compact controls for legacy layouts */
export function VoiceControls({
  onTranscript,
  disabled,
}: VoiceControlsProps) {
  const { isListening, isSupported, startListening, stopListening, error } = useSpeech(onTranscript);

  if (!isSupported) return null;

  return (
    <button
      type="button"
      onClick={() => (isListening ? stopListening() : startListening())}
      disabled={disabled}
      aria-label="Micro"
      className="rounded-full p-2 text-cyan-500/50 hover:text-cyan-400 disabled:opacity-40"
    >
      {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      {error && <span className="sr-only">{error}</span>}
    </button>
  );
}

/** Prominent mic for immersive full-screen mode */
interface ImmersiveMicProps {
  isListening: boolean;
  isSpeaking: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

export function ImmersiveMic({ isListening, isSpeaking, disabled, onToggle }: ImmersiveMicProps) {
  return (
    <motion.button
      type="button"
      onClick={onToggle}
      disabled={disabled || isSpeaking}
      aria-label={isListening ? "Arrêter le micro" : "Parler à A.V.A."}
      className="relative flex h-16 w-16 items-center justify-center rounded-full focus:outline-none disabled:opacity-40"
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.94 }}
      animate={
        isListening
          ? { boxShadow: ["0 0 20px rgba(0,212,255,0.3)", "0 0 40px rgba(0,212,255,0.6)", "0 0 20px rgba(0,212,255,0.3)"] }
          : { boxShadow: "0 0 24px rgba(0,212,255,0.2)" }
      }
      transition={{ duration: 1.2, repeat: isListening ? Infinity : 0 }}
    >
      {isListening && (
        <>
          <motion.span
            className="absolute inset-0 rounded-full border border-cyan-400/40"
            animate={{ scale: [1, 1.35, 1], opacity: [0.6, 0, 0.6] }}
            transition={{ duration: 1.8, repeat: Infinity }}
          />
          <motion.span
            className="absolute inset-[-8px] rounded-full border border-cyan-500/20"
            animate={{ scale: [1, 1.5, 1], opacity: [0.4, 0, 0.4] }}
            transition={{ duration: 2.2, repeat: Infinity, delay: 0.3 }}
          />
        </>
      )}

      <span
        className={`relative flex h-14 w-14 items-center justify-center rounded-full border transition-colors ${
          isListening
            ? "border-cyan-400 bg-cyan-500/25 text-cyan-200"
            : "border-cyan-600/40 bg-cyan-950/50 text-cyan-400/80 hover:border-cyan-500/60 hover:text-cyan-300"
        }`}
      >
        {isListening ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
      </span>
    </motion.button>
  );
}
