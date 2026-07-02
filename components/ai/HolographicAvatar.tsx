"use client";

import { motion } from "framer-motion";
import { useEffect, useId, useState } from "react";
import { useMouseTracking } from "@/hooks/useMouseTracking";
import { Particles } from "@/components/ai/Particles";
import type { AvaVoiceState } from "@/hooks/useSpeech";

export interface HolographicAvatarProps {
  /** Explicit state — overrides individual booleans when set */
  state?: AvaVoiceState;
  speaking?: boolean;
  listening?: boolean;
  thinking?: boolean;
  hovered?: boolean;
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  interactive?: boolean;
  showLabel?: boolean;
  immersive?: boolean;
  className?: string;
}

const sizeMap = {
  sm: { box: 64, scale: 0.55 },
  md: { box: 96, scale: 0.75 },
  lg: { box: 128, scale: 1 },
  xl: { box: 160, scale: 1.25 },
  hero: { box: 280, scale: 1.55 },
};

export function HolographicAvatar({
  state: stateProp,
  speaking = false,
  listening = false,
  thinking = false,
  hovered = false,
  size = "lg",
  interactive = true,
  showLabel = false,
  immersive = false,
  className = "",
}: HolographicAvatarProps) {
  const { box, scale } = sizeMap[size];
  const mouse = useMouseTracking(interactive);
  const [blink, setBlink] = useState(false);
  const uid = useId().replace(/:/g, "");

  const state: AvaVoiceState =
    stateProp ??
    (listening ? "listening" : thinking ? "thinking" : speaking ? "speaking" : "idle");

  const isSpeaking = state === "speaking";
  const isListening = state === "listening";
  const isThinking = state === "thinking";

  useEffect(() => {
    const blinkLoop = () => {
      if (!isSpeaking && Math.random() > 0.65) {
        setBlink(true);
        setTimeout(() => setBlink(false), 100);
      }
      return setTimeout(blinkLoop, isSpeaking ? 3500 : 1800 + Math.random() * 2500);
    };
    const t = blinkLoop();
    return () => clearTimeout(t);
  }, [isSpeaking]);

  const rotateY = mouse.x * (immersive ? 10 : hovered ? 14 : 8);
  const rotateX = -mouse.y * (immersive ? 8 : hovered ? 10 : 6);
  const eyeOffsetX = mouse.x * (immersive ? 4 : 3);
  const eyeOffsetY = mouse.y * (immersive ? 3 : 2);

  return (
    <motion.div
      className={`ava-holo-root relative ${className}`}
      style={{ width: box, height: box }}
      initial={{ opacity: 0, scale: 0.2, filter: "blur(16px)" }}
      animate={{
        opacity: 1,
        scale: 1,
        filter: "blur(0px)",
        y: immersive ? [0, -6, 0] : [0, -4, 0],
      }}
      transition={{
        opacity: { duration: 1.4, ease: "easeOut" },
        scale: { duration: 1.2, ease: [0.16, 1, 0.3, 1] },
        filter: { duration: 1.2 },
        y: { duration: immersive ? 5 : 4, repeat: Infinity, ease: "easeInOut" },
      }}
    >
      <Particles count={immersive ? 48 : size === "xl" ? 36 : 22} className="rounded-full" />

      {/* Halo — active during thinking only */}
      <motion.div
        className="ava-holo-halo absolute inset-[-14%] rounded-full"
        animate={{
          rotate: 360,
          opacity: isThinking ? [0.5, 1, 0.5] : isListening ? 0.35 : 0.25,
          scale: isThinking ? [1, 1.12, 1] : 1,
        }}
        transition={{
          rotate: { duration: isThinking ? 4 : 16, repeat: Infinity, ease: "linear" },
          opacity: { duration: isThinking ? 1.1 : 3, repeat: isThinking ? Infinity : 0 },
          scale: { duration: 1.4, repeat: isThinking ? Infinity : 0 },
        }}
      />

      <motion.div
        className="ava-holo-pulse absolute inset-[-8%] rounded-full"
        animate={{
          scale: isSpeaking ? [1, 1.15, 1] : isThinking ? [1, 1.1, 1] : [1, 1.05, 1],
          opacity: isSpeaking ? [0.5, 0.95, 0.5] : isThinking ? [0.35, 0.65, 0.35] : 0.35,
        }}
        transition={{
          duration: isSpeaking ? 0.45 : isThinking ? 1.2 : 2.5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      <div className="ava-holo-scan absolute inset-0 overflow-hidden rounded-full" />

      {isListening && (
        <>
          <motion.div
            className="absolute inset-[-20%] rounded-full border-2 border-cyan-400/40"
            animate={{ scale: [1, 1.25, 1], opacity: [0.7, 0, 0.7] }}
            transition={{ duration: 1.4, repeat: Infinity }}
          />
          <motion.div
            className="absolute inset-[-28%] rounded-full border border-cyan-500/25"
            animate={{ scale: [1, 1.35, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 1.8, repeat: Infinity, delay: 0.2 }}
          />
        </>
      )}

      <motion.div
        className="relative h-full w-full will-change-transform"
        style={{ perspective: 800, transformStyle: "preserve-3d" }}
        animate={{ rotateY, rotateX, scale: hovered ? 1.04 : 1 }}
        transition={{ type: "spring", stiffness: 100, damping: 20 }}
      >
        <svg
          viewBox="0 0 200 260"
          className={`h-full w-full ${immersive ? "drop-shadow-[0_0_48px_rgba(0,212,255,0.65)]" : "drop-shadow-[0_0_24px_rgba(0,212,255,0.5)]"}`}
          style={{ transform: `scale(${scale})`, transformOrigin: "center" }}
          aria-hidden
        >
          <defs>
            <linearGradient id={`avaFaceGrad-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(0,212,255,0.4)" />
              <stop offset="45%" stopColor="rgba(0,160,200,0.18)" />
              <stop offset="100%" stopColor="rgba(0,80,120,0.04)" />
            </linearGradient>
            <filter id={`avaGlow-${uid}`}>
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <clipPath id={`avaHeadClip-${uid}`}>
              <ellipse cx="100" cy="105" rx="64" ry="74" />
            </clipPath>
          </defs>

          <g clipPath={`url(#avaHeadClip-${uid})`} opacity="0.5" stroke="rgba(0,212,255,0.55)" strokeWidth="0.5" fill="none">
            {Array.from({ length: 9 }).map((_, i) => (
              <line key={`h${i}`} x1="36" y1={52 + i * 14} x2="164" y2={52 + i * 14} />
            ))}
            {Array.from({ length: 8 }).map((_, i) => (
              <line key={`v${i}`} x1={44 + i * 16} y1="48" x2={44 + i * 16} y2="178" />
            ))}
            <ellipse cx="100" cy="105" rx="64" ry="74" />
          </g>

          <ellipse
            cx="100"
            cy="105"
            rx="64"
            ry="74"
            fill={`url(#avaFaceGrad-${uid})`}
            stroke="rgba(0,212,255,0.65)"
            strokeWidth="1.2"
          />

          <motion.path
            d="M52 92 Q100 65 148 92"
            fill="none"
            stroke="rgba(0,255,255,0.75)"
            strokeWidth="1.5"
            filter={`url(#avaGlow-${uid})`}
            animate={{ opacity: isThinking ? [0.5, 1, 0.5] : [0.35, 0.7, 0.35] }}
            transition={{ duration: isThinking ? 1 : 2.2, repeat: Infinity }}
          />

          <g transform={`translate(${eyeOffsetX}, ${eyeOffsetY})`}>
            <motion.ellipse
              cx="76"
              cy="98"
              rx="11"
              animate={{
                ry: blink ? 1 : isListening ? [6, 9, 6] : 8,
              }}
              fill="rgba(0,212,255,0.92)"
              transition={{ duration: isListening ? 1.5 : 0.1, repeat: isListening ? Infinity : 0 }}
            />
            <motion.ellipse
              cx="124"
              cy="98"
              rx="11"
              animate={{
                ry: blink ? 1 : isListening ? [6, 9, 6] : 8,
              }}
              fill="rgba(0,212,255,0.92)"
              transition={{ duration: isListening ? 1.5 : 0.1, repeat: isListening ? Infinity : 0, delay: 0.1 }}
            />
            {!blink && (
              <>
                <circle cx="78" cy="96" r="3.5" fill="rgba(220,255,255,0.95)" />
                <circle cx="126" cy="96" r="3.5" fill="rgba(220,255,255,0.95)" />
              </>
            )}
          </g>

          <line x1="100" y1="106" x2="100" y2="124" stroke="rgba(0,212,255,0.35)" strokeWidth="0.8" />

          {/* Mouth — lip sync ONLY while speaking */}
          <motion.path
            fill="none"
            stroke="rgba(0,255,255,0.85)"
            strokeWidth="2"
            strokeLinecap="round"
            animate={
              isSpeaking
                ? {
                    d: [
                      "M80 136 Q100 150 120 136",
                      "M84 132 Q100 158 116 132",
                      "M82 138 Q100 145 118 138",
                      "M86 134 Q100 155 114 134",
                      "M80 136 Q100 150 120 136",
                    ],
                  }
                : { d: "M88 138 Q100 142 112 138" }
            }
            transition={{ duration: isSpeaking ? 0.2 : 0.3, repeat: isSpeaking ? Infinity : 0, ease: "easeInOut" }}
          />

          <path d="M42 178 Q100 200 158 178" fill="none" stroke="rgba(0,212,255,0.2)" strokeWidth="1" />
          <ellipse cx="72" cy="82" rx="20" ry="9" fill="rgba(255,255,255,0.07)" transform="rotate(-18 72 82)" />
        </svg>
      </motion.div>

      {showLabel && (
        <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-semibold tracking-widest text-cyan-300/90">
          A.V.A.
        </span>
      )}
    </motion.div>
  );
}
