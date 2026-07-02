"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { useCallback, useEffect } from "react";
import { AvaHologramScene } from "@/components/ai/ava3d/AvaHologramScene";
import { AudioWaveform } from "@/components/ai/AudioWaveform";
import { VoiceAssistant } from "@/components/ai/VoiceAssistant";
import { MicPermissionPanel } from "@/components/ai/MicPermissionPanel";
import { avaStatusLabel, useVoiceConversation } from "@/hooks/useVoiceConversation";

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

  const handlePermissionGranted = useCallback(() => {
    void voice.activateMic();
  }, [voice]);

  const bottomStatus = avaStatusLabel(voice.avaState, voice.isPromptingMic);
  const showListeningIndicator = voice.avaState === "listening";
  const showMicModal =
    voice.micPermission === "denied" ||
    voice.micPermission === "unsupported" ||
    voice.isPromptingMic;

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
        <button
          type="button"
          onClick={() => {
            voice.stopAll();
            onClose();
          }}
          className="absolute right-4 top-4 z-[80] flex items-center gap-1.5 rounded-lg border border-cyan-800/25 px-3 py-1.5 text-[10px] tracking-wider text-cyan-600/40 transition hover:border-cyan-600/35 hover:text-cyan-400/65 sm:right-6 sm:top-6"
          aria-label="Fermer A.V.A."
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.25} />
          <span className="hidden sm:inline">FERMER</span>
        </button>

        <div className="relative z-10 flex flex-1 items-center justify-center">
          {!voice.ready ? (
            <Loader2 className="h-7 w-7 animate-spin text-cyan-700/30" />
          ) : (
            <div className="ava-immersive-face relative h-[min(72vh,680px)] w-full max-w-3xl">
              <AvaHologramScene
                state={voice.avaState}
                isSpeaking={voice.isSpeaking}
                audioElement={voice.activeAudio}
                className="h-full w-full"
              />
            </div>
          )}
        </div>

        <div className="relative z-20 pb-8 pt-2 sm:pb-10">
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black via-black/95 to-transparent" />

          <div className="relative flex flex-col items-center gap-3">
            <AnimatePresence mode="wait">
              {showListeningIndicator && (
                <motion.p
                  key="listening"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 text-[10px] tracking-[0.2em] text-cyan-500/45 uppercase"
                >
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400/70" />
                  A.V.A. écoute…
                </motion.p>
              )}
              {!showListeningIndicator && bottomStatus && voice.avaState !== "idle" && (
                <motion.p
                  key={bottomStatus}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.45 }}
                  exit={{ opacity: 0 }}
                  className="text-[10px] tracking-[0.18em] text-cyan-600/35 uppercase"
                >
                  {bottomStatus}
                </motion.p>
              )}
            </AnimatePresence>

            <div className="flex items-center gap-4">
              <AudioWaveform active={voice.avaState !== "idle"} state={voice.avaState} />

              {voice.canListen && (
                <VoiceAssistant
                  state={voice.isPromptingMic ? "listening" : voice.avaState}
                  disabled={!voice.ready || voice.blocked}
                  onToggleMic={voice.toggleMic}
                />
              )}

              <AudioWaveform active={voice.avaState !== "idle"} state={voice.avaState} />
            </div>

            {voice.error &&
              voice.micPermission !== "denied" &&
              voice.micPermission !== "unsupported" && (
                <p className="max-w-xs px-4 text-center text-[10px] text-amber-700/50">{voice.error}</p>
              )}
          </div>
        </div>

        {showMicModal && (
          <MicPermissionPanel
            status={voice.micPermission}
            isPrompting={voice.isPromptingMic}
            showSettingsHelp={voice.showSettingsHelp}
            onActivateMic={voice.activateMic}
            onToggleSettingsHelp={() => voice.setShowSettingsHelp((v) => !v)}
            onPermissionGranted={handlePermissionGranted}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
}

export const AIAssistantChat = ImmersiveAvaScreen;
