"use client";

import dynamic from "next/dynamic";
import type { AvaConversationState } from "@/hooks/useVoiceConversation";

/**
 * Scène immersive Ava — pack Cursor (GLB meshopt + textures PBR).
 * Three.js uniquement via import dynamique client (ssr: false).
 */
const AvaPackCanvas = dynamic(
  () =>
    import("@/components/ava/pack/AvaPackCanvas").then((m) => m.AvaPackCanvas),
  {
    ssr: false,
    loading: () => (
      <div
        className="ava-3d-loading"
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#05070d",
          color: "rgba(255,255,255,0.4)",
          fontSize: 14,
          zIndex: 0,
        }}
      >
        Chargement du modèle…
      </div>
    ),
  }
);

interface AvaHologramSceneProps {
  state: AvaConversationState;
  isSpeaking: boolean;
  audioElement: HTMLAudioElement | null;
  /** Texte TTS courant — sync bouche pack */
  speechText?: string;
  className?: string;
}

export function AvaHologramScene({
  isSpeaking,
  speechText,
  className,
}: AvaHologramSceneProps) {
  return (
    <AvaPackCanvas
      isSpeaking={isSpeaking}
      speechText={speechText}
      className={className}
      enableOrbit={false}
    />
  );
}
