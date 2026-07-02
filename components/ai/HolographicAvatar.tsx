"use client";

import { motion } from "framer-motion";
import { useEffect, useId, useState } from "react";
import { useMouseTracking } from "@/hooks/useMouseTracking";
import { Particles } from "@/components/ai/Particles";
import type { AvaConversationState } from "@/hooks/useVoiceConversation";

export interface HolographicAvatarProps {
  state?: AvaConversationState;
  speaking?: boolean;
  listening?: boolean;
  thinking?: boolean;
  hovered?: boolean;
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  interactive?: boolean;
  showLabel?: boolean;
  immersive?: boolean;
  feminine?: boolean;
  className?: string;
}

const sizeMap = {
  sm: { box: 64, scale: 0.55 },
  md: { box: 96, scale: 0.75 },
  lg: { box: 128, scale: 1 },
  xl: { box: 160, scale: 1.25 },
  hero: { box: 300, scale: 1.6 },
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
  feminine = false,
  className = "",
}: HolographicAvatarProps) {
  const { box, scale } = sizeMap[size];
  const mouse = useMouseTracking(interactive);
  const [blink, setBlink] = useState(false);
  const uid = useId().replace(/:/g, "");

  const state: AvaConversationState =
    stateProp ??
    (listening ? "listening" : thinking ? "thinking" : speaking ? "speaking" : "idle");

  const isSpeaking = state === "speaking";
  const isListening = state === "listening";
  const isThinking = state === "thinking";

  useEffect(() => {
    const loop = () => {
      if (!isSpeaking && Math.random() > 0.6) {
        setBlink(true);
        setTimeout(() => setBlink(false), 110);
      }
      return setTimeout(loop, isSpeaking ? 4000 : 1600 + Math.random() * 2200);
    };
    const t = loop();
    return () => clearTimeout(t);
  }, [isSpeaking]);

  const rotateY = mouse.x * (immersive ? 12 : 8);
  const rotateX = -mouse.y * (immersive ? 9 : 6);
  const eyeX = mouse.x * (immersive ? 5 : 3);
  const eyeY = mouse.y * (immersive ? 3.5 : 2);

  return (
    <motion.div
      className={`ava-holo-root relative ${className}`}
      style={{ width: box, height: box }}
      initial={{ opacity: 0, scale: 0.15, filter: "blur(20px)" }}
      animate={{
        opacity: 1,
        scale: 1,
        filter: "blur(0px)",
        y: immersive ? [0, -8, 0] : [0, -4, 0],
      }}
      transition={{
        opacity: { duration: 1.6, ease: "easeOut" },
        scale: { duration: 1.4, ease: [0.16, 1, 0.3, 1] },
        y: { duration: 5.5, repeat: Infinity, ease: "easeInOut" },
      }}
    >
      <Particles count={immersive ? 56 : 24} className="rounded-full" />

      {/* Halo — thinking */}
      <motion.div
        className="ava-holo-halo absolute inset-[-16%] rounded-full"
        animate={{
          rotate: 360,
          opacity: isThinking ? [0.45, 1, 0.45] : 0.22,
          scale: isThinking ? [1, 1.14, 1] : 1,
        }}
        transition={{
          rotate: { duration: isThinking ? 3.5 : 20, repeat: Infinity, ease: "linear" },
          opacity: { duration: 1.2, repeat: isThinking ? Infinity : 0 },
          scale: { duration: 1.5, repeat: isThinking ? Infinity : 0 },
        }}
      />

      <motion.div
        className="ava-holo-pulse absolute inset-[-10%] rounded-full"
        animate={{
          scale: isSpeaking ? [1, 1.18, 1] : isListening ? [1, 1.1, 1] : [1, 1.06, 1],
          opacity: isSpeaking ? [0.45, 0.95, 0.45] : 0.35,
        }}
        transition={{ duration: isSpeaking ? 0.4 : 2.8, repeat: Infinity }}
      />

      <div className="ava-holo-scan absolute inset-0 overflow-hidden rounded-full opacity-80" />

      {isListening && (
        <motion.div
          className="absolute inset-[-22%] rounded-full border border-cyan-300/35"
          animate={{ scale: [1, 1.28, 1], opacity: [0.65, 0, 0.65] }}
          transition={{ duration: 1.6, repeat: Infinity }}
        />
      )}

      <motion.div
        className="relative h-full w-full will-change-transform"
        style={{ perspective: 900, transformStyle: "preserve-3d" }}
        animate={{ rotateY, rotateX }}
        transition={{ type: "spring", stiffness: 90, damping: 22 }}
      >
        <svg
          viewBox="0 0 220 280"
          className={`h-full w-full ${immersive ? "drop-shadow-[0_0_56px_rgba(0,212,255,0.7)]" : ""}`}
          style={{ transform: `scale(${scale})`, transformOrigin: "center" }}
          aria-hidden
        >
          <defs>
            <linearGradient id={`fg-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(0,230,255,0.42)" />
              <stop offset="55%" stopColor="rgba(0,160,210,0.16)" />
              <stop offset="100%" stopColor="rgba(0,60,100,0.03)" />
            </linearGradient>
            <radialGradient id={`cheek-${uid}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(0,255,255,0.12)" />
              <stop offset="100%" stopColor="rgba(0,255,255,0)" />
            </radialGradient>
            <filter id={`glow-${uid}`}>
              <feGaussianBlur stdDeviation="2.8" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <clipPath id={`head-${uid}`}>
              <path d="M110 38 C145 38 168 62 172 98 C176 134 168 168 148 188 C128 208 92 208 72 188 C52 168 44 134 48 98 C52 62 75 38 110 38 Z" />
            </clipPath>
          </defs>

          {/* Cheveux holographiques */}
          {feminine && (
            <g opacity="0.55" stroke="rgba(0,212,255,0.45)" strokeWidth="0.7" fill="none">
              <path d="M68 55 Q55 30 75 22 Q95 15 110 18" />
              <path d="M152 55 Q165 28 145 20 Q125 12 110 18" />
              <path d="M62 75 Q40 90 45 120" />
              <path d="M158 75 Q180 92 175 122" />
              <path d="M110 18 L110 42" opacity="0.4" />
            </g>
          )}

          {/* Maillage */}
          <g clipPath={`url(#head-${uid})`} opacity="0.42" stroke="rgba(0,212,255,0.4)" strokeWidth="0.45" fill="none">
            {Array.from({ length: 10 }).map((_, i) => (
              <line key={`h${i}`} x1="52" y1={48 + i * 14} x2="168" y2={48 + i * 14} />
            ))}
            {Array.from({ length: 8 }).map((_, i) => (
              <line key={`v${i}`} x1={58 + i * 15} y1="44" x2={58 + i * 15} y2="195" />
            ))}
          </g>

          {/* Visage */}
          <path
            d="M110 38 C145 38 168 62 172 98 C176 134 168 168 148 188 C128 208 92 208 72 188 C52 168 44 134 48 98 C52 62 75 38 110 38 Z"
            fill={`url(#fg-${uid})`}
            stroke="rgba(0,220,255,0.6)"
            strokeWidth="1.1"
          />

          <ellipse cx="82" cy="118" rx="14" ry="10" fill={`url(#cheek-${uid})`} />
          <ellipse cx="138" cy="118" rx="14" ry="10" fill={`url(#cheek-${uid})`} />

          {/* Sourcils */}
          <path d="M72 88 Q88 82 98 86" fill="none" stroke="rgba(0,255,255,0.5)" strokeWidth="1" strokeLinecap="round" />
          <path d="M122 86 Q132 82 148 88" fill="none" stroke="rgba(0,255,255,0.5)" strokeWidth="1" strokeLinecap="round" />

          {/* Yeux — regard humain */}
          <g transform={`translate(${eyeX}, ${eyeY})`}>
            <motion.ellipse
              cx="88"
              cy="102"
              rx={feminine ? 12 : 11}
              animate={{ ry: blink ? 1.5 : isListening ? [6, 9, 6] : 9 }}
              fill="rgba(0,200,240,0.15)"
              stroke="rgba(0,255,255,0.7)"
              strokeWidth="0.8"
              transition={{ duration: isListening ? 1.8 : 0.12, repeat: isListening ? Infinity : 0 }}
            />
            <motion.ellipse
              cx="132"
              cy="102"
              rx={feminine ? 12 : 11}
              animate={{ ry: blink ? 1.5 : isListening ? [6, 9, 6] : 9 }}
              fill="rgba(0,200,240,0.15)"
              stroke="rgba(0,255,255,0.7)"
              strokeWidth="0.8"
              transition={{ duration: isListening ? 1.8 : 0.12, repeat: isListening ? Infinity : 0, delay: 0.08 }}
            />
            {!blink && (
              <>
                <circle cx="90" cy="100" r="4.5" fill="rgba(0,255,255,0.95)" filter={`url(#glow-${uid})`} />
                <circle cx="134" cy="100" r="4.5" fill="rgba(0,255,255,0.95)" filter={`url(#glow-${uid})`} />
                <circle cx="91.5" cy="98.5" r="1.5" fill="rgba(255,255,255,0.95)" />
                <circle cx="135.5" cy="98.5" r="1.5" fill="rgba(255,255,255,0.95)" />
                {feminine && (
                  <>
                    <path d="M76 94 Q84 90 92 93" fill="none" stroke="rgba(0,255,255,0.35)" strokeWidth="0.6" />
                    <path d="M128 93 Q136 90 144 94" fill="none" stroke="rgba(0,255,255,0.35)" strokeWidth="0.6" />
                  </>
                )}
              </>
            )}
          </g>

          {/* Nez */}
          <path d="M110 108 Q108 122 110 128 Q112 122 110 108" fill="none" stroke="rgba(0,212,255,0.3)" strokeWidth="0.7" />

          {/* Bouche — lip sync speaking only */}
          <motion.path
            fill="none"
            stroke="rgba(0,255,255,0.9)"
            strokeWidth="1.8"
            strokeLinecap="round"
            filter={`url(#glow-${uid})`}
            animate={
              isSpeaking
                ? {
                    d: [
                      "M92 148 Q110 162 128 148",
                      "M96 144 Q110 168 124 144",
                      "M94 150 Q110 158 126 150",
                      "M98 145 Q110 165 122 145",
                      "M92 148 Q110 162 128 148",
                    ],
                  }
                : { d: feminine ? "M96 150 Q110 154 124 150" : "M98 150 Q110 152 122 150" }
            }
            transition={{ duration: 0.18, repeat: isSpeaking ? Infinity : 0, ease: "easeInOut" }}
          />

          {/* Cou / épaules */}
          <path
            d="M82 188 Q110 210 138 188 L148 220 Q110 235 72 220 Z"
            fill="rgba(0,180,220,0.06)"
            stroke="rgba(0,212,255,0.2)"
            strokeWidth="0.8"
          />

          {/* Reflet */}
          <ellipse cx="85" cy="72" rx="22" ry="10" fill="rgba(255,255,255,0.06)" transform="rotate(-15 85 72)" />

          <motion.path
            d="M58 95 Q110 68 162 95"
            fill="none"
            stroke="rgba(0,255,255,0.55)"
            strokeWidth="1.2"
            filter={`url(#glow-${uid})`}
            animate={{ opacity: [0.3, 0.85, 0.3] }}
            transition={{ duration: 2.5, repeat: Infinity }}
          />
        </svg>
      </motion.div>

      {showLabel && (
        <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs tracking-[0.3em] text-cyan-300/80">
          A.V.A.
        </span>
      )}
    </motion.div>
  );
}
