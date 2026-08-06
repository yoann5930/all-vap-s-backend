"use client";

import type { AvaInputMode } from "@/lib/ava/input-mode-manager";
import { conversationStatusLabel } from "@/lib/ava/input-mode-manager";

type Phase = "listening" | "thinking" | "speaking" | "idle";

type Props = {
  mode: AvaInputMode;
  phase: Phase;
  micActive: boolean;
  className?: string;
};

/** Indicateur d'état non cliquable — remplace le bouton micro central. */
export function ConversationStatus({
  mode,
  phase,
  micActive,
  className = "",
}: Props) {
  const label = conversationStatusLabel(mode, phase);
  const listening =
    micActive && phase === "listening" && mode === "VOICE_ACTIVE";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`flex items-center justify-center gap-2 text-[10px] tracking-[0.18em] uppercase ${className}`}
    >
      {listening ? (
        <span
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400/80"
          aria-hidden
        />
      ) : (
        <span
          className="h-1.5 w-1.5 rounded-full bg-cyan-700/40"
          aria-hidden
        />
      )}
      <span
        className={
          listening ? "text-cyan-400/70" : "text-cyan-600/45"
        }
      >
        {label}
      </span>
      {micActive && mode === "VOICE_ACTIVE" ? (
        <span className="sr-only">Le microphone est actif.</span>
      ) : (
        <span className="sr-only">Le microphone n&apos;écoute pas.</span>
      )}
    </div>
  );
}
