"use client";

import dynamic from "next/dynamic";
import type { AvaConversationState } from "@/hooks/useVoiceConversation";

const AvaCanvas = dynamic(
  () => import("@/components/ai/ava3d/AvaCanvas").then((m) => m.AvaCanvas),
  {
    ssr: false,
    loading: () => <div className="ava-3d-loading h-full w-full bg-black" />,
  }
);

interface AvaHologramSceneProps {
  state: AvaConversationState;
  isSpeaking: boolean;
  audioElement: HTMLAudioElement | null;
  className?: string;
}

export function AvaHologramScene({ state, isSpeaking, audioElement, className }: AvaHologramSceneProps) {
  return (
    <AvaCanvas
      state={state}
      isSpeaking={isSpeaking}
      audioElement={audioElement}
      className={className}
    />
  );
}
