"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Send, X } from "lucide-react";
import { useEffect, useState } from "react";
import { HolographicAvatar } from "@/components/ai/HolographicAvatar";
import { VoiceAssistant } from "@/components/ai/VoiceAssistant";
import { MicPermissionPanel } from "@/components/ai/MicPermissionPanel";
import { Particles } from "@/components/ai/Particles";
import { avaStatusLabel, useVoiceConversation } from "@/hooks/useVoiceConversation";

interface ImmersiveAvaScreenProps {
  onClose: () => void;
  onSpeakingChange?: (speaking: boolean) => void;
}

export function ImmersiveAvaScreen({ onClose, onSpeakingChange }: ImmersiveAvaScreenProps) {
  const voice = useVoiceConversation();
  const [textFallback, setTextFallback] = useState("");

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

  const bottomStatus = avaStatusLabel(voice.avaState, voice.isPromptingMic);

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (textFallback.trim()) {
      void voice.sendMessage(textFallback);
      setTextFallback("");
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        role="dialog"
        aria-label="A.V.A. — assistante holographique"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.7 }}
        className="ava-immersive fixed inset-0 z-[70] flex flex-col bg-black"
      >
        <Particles count={80} color="0, 212, 255" className="opacity-45" />
        <div className="ava-immersive-scan pointer-events-none absolute inset-0 opacity-60" />
        <div className="ava-cinematic-vignette pointer-events-none absolute inset-0" />

        <button
          type="button"
          onClick={() => {
            voice.stopAll();
            onClose();
          }}
          className="absolute right-4 top-4 z-20 rounded-full p-2 text-cyan-700/25 transition hover:bg-white/5 hover:text-cyan-500/50 sm:right-6 sm:top-6"
          aria-label="Fermer A.V.A."
        >
          <X className="h-5 w-5" strokeWidth={1.25} />
        </button>

        {/* Visage seul — aucun texte au centre */}
        <div className="relative z-10 flex flex-1 items-center justify-center">
          {!voice.ready ? (
            <Loader2 className="h-7 w-7 animate-spin text-cyan-700/30" />
          ) : (
            <div className="ava-immersive-face flex flex-col items-center">
              <HolographicAvatar state={voice.avaState} size="hero" interactive immersive />
              <div className="ava-face-projection" aria-hidden />
            </div>
          )}
        </div>

        {/* Bas : micro + statut discret (hors centre) */}
        <div className="relative z-20 pb-8 pt-2 sm:pb-10">
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black via-black/95 to-transparent" />

          <div className="relative flex flex-col items-center gap-3">
            {bottomStatus && (
              <p className="text-[10px] tracking-[0.18em] text-cyan-600/40 uppercase">{bottomStatus}</p>
            )}

            <MicPermissionPanel
              status={voice.micPermission}
              isPrompting={voice.isPromptingMic}
              showSettingsHelp={voice.showSettingsHelp}
              onActivateMic={voice.activateMic}
              onToggleSettingsHelp={() => voice.setShowSettingsHelp((v) => !v)}
            />

            {voice.error &&
              voice.micPermission !== "denied" &&
              voice.micPermission !== "unsupported" && (
                <p className="max-w-xs px-4 text-center text-[10px] text-amber-700/50">{voice.error}</p>
              )}

            {voice.canListen && (
              <VoiceAssistant
                state={voice.isPromptingMic ? "listening" : voice.avaState}
                disabled={!voice.ready || voice.blocked}
                onToggleMic={voice.toggleMic}
              />
            )}

            {voice.needsTextFallback && voice.ready && (
              <form
                onSubmit={handleTextSubmit}
                className="flex w-full max-w-[240px] items-center gap-2 px-4 opacity-40 focus-within:opacity-70"
              >
                <input
                  type="text"
                  value={textFallback}
                  onChange={(e) => setTextFallback(e.target.value)}
                  placeholder="Texte si micro indisponible"
                  disabled={voice.blocked || voice.avaState === "thinking"}
                  className="flex-1 border-0 border-b border-cyan-950/80 bg-transparent py-1 text-center text-[9px] text-cyan-700/40 placeholder:text-cyan-950 focus:outline-none"
                />
                {textFallback.trim() && (
                  <button type="submit" className="text-cyan-800/40 hover:text-cyan-600/50" aria-label="Envoyer">
                    <Send className="h-3 w-3" />
                  </button>
                )}
              </form>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export const AIAssistantChat = ImmersiveAvaScreen;
