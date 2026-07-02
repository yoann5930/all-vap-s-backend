"use client";

import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import type { AvaConversationState } from "@/hooks/useVoiceConversation";

interface AudioWaveformProps {
  active: boolean;
  state: AvaConversationState;
}

export function AudioWaveform({ active, state }: AudioWaveformProps) {
  const bars = 12;
  const isListening = state === "listening";
  const isSpeaking = state === "speaking";

  if (!active && !isListening && !isSpeaking) return null;

  return (
    <div className="flex items-center gap-[3px]" aria-hidden>
      {Array.from({ length: bars }).map((_, i) => (
        <WaveBar key={i} index={i} active={isListening || isSpeaking} intensity={isSpeaking ? 1 : 0.65} />
      ))}
    </div>
  );
}

function WaveBar({ index, active, intensity }: { index: number; active: boolean; intensity: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!active || !ref.current) return;
    let raf = 0;
    const tick = () => {
      if (ref.current) {
        const h = 6 + Math.abs(Math.sin(Date.now() * 0.008 + index * 0.7)) * 18 * intensity;
        ref.current.style.height = `${h}px`;
        ref.current.style.opacity = `${0.35 + intensity * 0.45}`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, index, intensity]);

  return (
    <motion.span
      ref={ref}
      className="block w-[2px] rounded-full bg-cyan-400/70"
      style={{ height: 8, opacity: 0.3 }}
      initial={false}
    />
  );
}
