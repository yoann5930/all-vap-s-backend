"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { HolographicAvatar } from "@/components/ai/HolographicAvatar";
import { VoiceAssistant } from "@/components/ai/VoiceAssistant";
import { Particles } from "@/components/ai/Particles";
import { avaStatusLabel, useVoiceConversation } from "@/hooks/useVoiceConversation";
import { useEffect } from "react";

interface ImmersiveAvaScreenProps {
  onClose: () => void;
  onSpeakingChange?: (speaking: boolean) => void;
}

export function ImmersiveAvaScreen({ onClose, onSpeakingChange }: ImmersiveAvaScreenProps) {
  const voice = useVoiceConversation();

  useEffect(() => {
    document.body.style.overflow = "hidden";
    void voice.init();
    return () => {
      document.body.style.overflow = "";
      voice.stopAll();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    onSpeakingChange?.(voice.isSpeaking);
  }, [voice.isSpeaking, onSpeakingChange]);

  const status = avaStatusLabel(voice.avaState);
  const hint =
    voice.avaState === "listening" && voice.interimTranscript
      ? voice.interimTranscript
      : voice.subtitle;

  return (
    <AnimatePresence>
      <motion.div
        role="dialog"
        aria-label="A.V.A. — assistante holographique vocale"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.7 }}
        className="ava-immersive fixed inset-0 z-[70] flex flex-col bg-black"
      >
        <Particles count={70} color="0, 212, 255" className="opacity-50" />
        <div className="ava-immersive-scan pointer-events-none absolute inset-0" />
        <div className="ava-cinematic-vignette pointer-events-none absolute inset-0" />

        {/* Fermer — discret */}
        <button
          type="button"
          onClick={() => {
            voice.stopAll();
            onClose();
          }}
          className="absolute right-4 top-4 z-20 rounded-full p-2 text-cyan-600/30 transition hover:bg-white/5 hover:text-cyan-400/60 sm:right-6 sm:top-6"
          aria-label="Fermer A.V.A."
        >
          <X className="h-5 w-5" strokeWidth={1.25} />
        </button>

        {/* Visage — centre */}
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center">
          {!voice.ready ? (
            <Loader2 className="h-7 w-7 animate-spin text-cyan-600/40" />
          ) : (
            <div className="ava-immersive-face flex flex-col items-center">
              <HolographicAvatar state={voice.avaState} size="hero" interactive immersive feminine />

              {/* Projection lumineuse sous le visage */}
              <div className="ava-face-projection" aria-hidden />

              {status && (
                <motion.p
                  key={status}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0.35, 0.65, 0.35] }}
                  transition={{ duration: 2.2, repeat: Infinity }}
                  className="mt-10 text-[11px] tracking-[0.2em] text-cyan-500/45 uppercase"
                >
                  {status}
                </motion.p>
              )}
            </div>
          )}
        </div>

        {/* Bas — micro centré + sous-titre discret */}
        <div className="relative z-20 pb-8 pt-4 sm:pb-10">
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black via-black/90 to-transparent" />

          <div className="relative flex flex-col items-center gap-5">
            <AnimatePresence mode="wait">
              {hint && voice.avaState !== "idle" && (
                <motion.p
                  key={hint}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="max-w-xs px-6 text-center text-[10px] leading-relaxed text-cyan-500/35"
                >
                  {hint}
                </motion.p>
              )}
            </AnimatePresence>

            {voice.error && (
              <p className="max-w-xs px-4 text-center text-[10px] text-amber-600/60">{voice.error}</p>
            )}

            {!voice.canListen && voice.ready && (
              <p className="text-[10px] text-cyan-700/50">Micro non supporté sur ce navigateur</p>
            )}

            <VoiceAssistant
              state={voice.avaState}
              disabled={!voice.ready || voice.blocked}
              onToggleMic={voice.toggleMic}
            />

            <p className="text-[8px] tracking-widest text-cyan-950 uppercase">+18 · All Vap&apos;s</p>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export const AIAssistantChat = ImmersiveAvaScreen;
