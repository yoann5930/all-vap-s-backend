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
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  interactive?: boolean;
  showLabel?: boolean;
  immersive?: boolean;
  className?: string;
}

const sizeMap = {
  sm: { box: 80, w: 120, h: 156 },
  md: { box: 120, w: 160, h: 208 },
  lg: { box: 160, w: 200, h: 260 },
  xl: { box: 200, w: 240, h: 312 },
  hero: { box: 380, w: 400, h: 520 },
};

const MOUTH_CLOSED = "M178 318 Q200 326 222 318 Q200 332 178 318 Z";
const MOUTH_SLIGHT = "M176 316 Q200 334 224 316 Q200 348 176 316 Z";
const MOUTH_OPEN = "M180 314 Q200 352 220 314 Q200 368 180 314 Z";
const MOUTH_WIDE = "M182 312 Q200 362 218 312 Q200 378 182 312 Z";

export function HolographicAvatar({
  state: stateProp,
  speaking = false,
  listening = false,
  thinking = false,
  size = "lg",
  interactive = true,
  showLabel = false,
  immersive = false,
  className = "",
}: HolographicAvatarProps) {
  const dims = sizeMap[size];
  const mouse = useMouseTracking(interactive && immersive);
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
      if (Math.random() > 0.55) {
        setBlink(true);
        setTimeout(() => setBlink(false), 100);
      }
      return setTimeout(loop, isSpeaking ? 3200 : 1400 + Math.random() * 2000);
    };
    const t = loop();
    return () => clearTimeout(t);
  }, [isSpeaking]);

  const eyeX = mouse.x * (immersive ? 6 : 3);
  const eyeY = mouse.y * (immersive ? 4 : 2);
  const rotateY = mouse.x * (immersive ? 8 : 5);
  const rotateX = -mouse.y * (immersive ? 6 : 4);

  const mouthPaths = isSpeaking
    ? [MOUTH_CLOSED, MOUTH_SLIGHT, MOUTH_OPEN, MOUTH_WIDE, MOUTH_OPEN, MOUTH_SLIGHT, MOUTH_CLOSED]
    : [MOUTH_CLOSED];

  return (
    <motion.div
      className={`ava-holo-root ava-realistic-face relative ${className}`}
      style={{ width: dims.box, height: dims.box * 1.15 }}
      initial={{ opacity: 0, scale: 0.88, filter: "blur(16px)" }}
      animate={{
        opacity: 1,
        scale: 1,
        filter: "blur(0px)",
        y: immersive ? [0, -6, 0] : 0,
      }}
      transition={{
        opacity: { duration: 1.4 },
        scale: { duration: 1.2, ease: [0.16, 1, 0.3, 1] },
        y: { duration: 5, repeat: Infinity, ease: "easeInOut" },
      }}
    >
      <Particles count={immersive ? 64 : 20} className="rounded-full opacity-70" />

      <motion.div
        className="ava-holo-halo absolute inset-[-8%] rounded-[45%]"
        animate={{
          rotate: 360,
          opacity: isThinking ? [0.4, 0.85, 0.4] : isSpeaking ? [0.3, 0.55, 0.3] : 0.25,
          scale: isThinking ? [1, 1.1, 1] : 1,
        }}
        transition={{
          rotate: { duration: isThinking ? 4 : 18, repeat: Infinity, ease: "linear" },
          opacity: { duration: 1.5, repeat: Infinity },
        }}
      />

      <motion.div
        className="ava-holo-pulse absolute inset-[-4%] rounded-[45%]"
        animate={{
          scale: isSpeaking ? [1, 1.04, 1] : [1, 1.02, 1],
          opacity: isSpeaking ? [0.35, 0.6, 0.35] : 0.3,
        }}
        transition={{ duration: isSpeaking ? 0.35 : 3, repeat: Infinity }}
      />

      {isListening && (
        <motion.div
          className="absolute inset-[-6%] rounded-[45%] border border-cyan-300/30"
          animate={{ scale: [1, 1.06, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}

      <motion.div
        className="ava-portrait-wrap relative mx-auto will-change-transform"
        style={{
          width: dims.w,
          height: dims.h,
          perspective: 1000,
        }}
        animate={{
          rotateY,
          rotateX,
          scale: isSpeaking ? [1, 1.012, 1] : 1,
        }}
        transition={{
          rotateY: { type: "spring", stiffness: 80, damping: 20 },
          rotateX: { type: "spring", stiffness: 80, damping: 20 },
          scale: { duration: 0.4, repeat: isSpeaking ? Infinity : 0 },
        }}
      >
        {/* Scan fin — overlay, pas de grille sur le visage */}
        <div className="ava-fine-face-scan pointer-events-none absolute inset-0 z-20 rounded-[42%]" />

        <svg
          viewBox="0 0 400 520"
          width={dims.w}
          height={dims.h}
          className="ava-portrait-svg relative z-10"
          aria-hidden
        >
          <defs>
            <linearGradient id={`skin-${uid}`} x1="200" y1="60" x2="200" y2="420">
              <stop offset="0%" stopColor="rgba(140,235,255,0.55)" />
              <stop offset="50%" stopColor="rgba(60,190,230,0.35)" />
              <stop offset="100%" stopColor="rgba(10,80,110,0.2)" />
            </linearGradient>
            <radialGradient id={`skinGlow-${uid}`} cx="50%" cy="35%" r="55%">
              <stop offset="0%" stopColor="rgba(0,255,255,0.18)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0)" />
            </radialGradient>
            <linearGradient id={`hair-${uid}`} x1="200" y1="20" x2="200" y2="180">
              <stop offset="0%" stopColor="rgba(0,240,255,0.5)" />
              <stop offset="100%" stopColor="rgba(0,60,90,0.35)" />
            </linearGradient>
            <radialGradient id={`iris-${uid}`} cx="45%" cy="40%" r="55%">
              <stop offset="0%" stopColor="#a8ffff" />
              <stop offset="50%" stopColor="#00c8e8" />
              <stop offset="100%" stopColor="#024" />
            </radialGradient>
            <linearGradient id={`lip-${uid}`} x1="200" y1="310" x2="200" y2="350">
              <stop offset="0%" stopColor="rgba(100,255,255,0.75)" />
              <stop offset="100%" stopColor="rgba(0,160,200,0.55)" />
            </linearGradient>
            <filter id={`soft-${uid}`}>
              <feGaussianBlur stdDeviation="0.6" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Cheveux attachés — silhouette réaliste */}
          <path
            d="M124 125 C100 85 118 42 168 32 C195 26 205 26 232 32 C282 42 300 85 276 125 C292 95 285 55 255 42 C220 30 180 30 145 42 C115 55 108 95 124 125 Z"
            fill={`url(#hair-${uid})`}
            opacity="0.65"
          />
          <ellipse cx="200" cy="48" rx="58" ry="24" fill={`url(#hair-${uid})`} opacity="0.4" />

          {/* Visage — proportions humaines */}
          <path
            d="M200 78 C252 78 286 108 296 158 C306 210 298 268 276 308 C254 345 228 362 200 366 C172 362 146 345 124 308 C102 268 94 210 104 158 C114 108 148 78 200 78 Z"
            fill={`url(#skin-${uid})`}
            stroke="rgba(0,220,255,0.28)"
            strokeWidth="0.6"
          />
          <path
            d="M200 78 C252 78 286 108 296 158 C306 210 298 268 276 308 C254 345 228 362 200 366 C172 362 146 345 124 308 C102 268 94 210 104 158 C114 108 148 78 200 78 Z"
            fill={`url(#skinGlow-${uid})`}
          />

          {/* Cou */}
          <path
            d="M162 348 C175 378 188 402 200 418 C212 402 225 378 238 348 C252 372 262 400 266 438 C245 455 155 455 134 438 C138 400 148 372 162 348 Z"
            fill={`url(#skin-${uid})`}
            opacity="0.4"
          />

          {/* Sourcils naturels */}
          <path d="M142 172 C158 162 174 164 184 170" stroke="rgba(0,230,255,0.45)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          <path d="M216 170 C226 164 242 162 258 172" stroke="rgba(0,230,255,0.45)" strokeWidth="2.5" strokeLinecap="round" fill="none" />

          {/* Yeux réalistes */}
          <g transform={`translate(${eyeX}, ${eyeY})`}>
            {/* Œil gauche */}
            <g>
              <motion.ellipse
                cx="158"
                cy="202"
                rx="24"
                ry="15"
                fill="rgba(0,30,50,0.35)"
                animate={{ ry: blink ? 1.5 : 15 }}
                transition={{ duration: 0.1 }}
              />
              {!blink && (
                <>
                  <ellipse cx="158" cy="202" rx="20" ry="12" fill="rgba(180,240,255,0.12)" />
                  <circle cx="158" cy="202" r="10" fill={`url(#iris-${uid})`} filter={`url(#soft-${uid})`} />
                  <circle cx="158" cy="202" r="5" fill="#011820" />
                  <circle cx="161" cy="199" r="2.2" fill="rgba(255,255,255,0.95)" />
                  <path d="M134 188 Q158 176 182 188" stroke="rgba(0,200,240,0.35)" strokeWidth="2.2" fill="none" strokeLinecap="round" />
                  <path d="M134 188 Q158 182 182 188" stroke="rgba(0,255,255,0.15)" strokeWidth="0.8" fill="none" />
                </>
              )}
            </g>
            {/* Œil droit */}
            <g>
              <motion.ellipse
                cx="242"
                cy="202"
                rx="24"
                ry="15"
                fill="rgba(0,30,50,0.35)"
                animate={{ ry: blink ? 1.5 : 15 }}
                transition={{ duration: 0.1 }}
              />
              {!blink && (
                <>
                  <ellipse cx="242" cy="202" rx="20" ry="12" fill="rgba(180,240,255,0.12)" />
                  <circle cx="242" cy="202" r="10" fill={`url(#iris-${uid})`} filter={`url(#soft-${uid})`} />
                  <circle cx="242" cy="202" r="5" fill="#011820" />
                  <circle cx="245" cy="199" r="2.2" fill="rgba(255,255,255,0.95)" />
                  <path d="M218 188 Q242 176 266 188" stroke="rgba(0,200,240,0.35)" strokeWidth="2.2" fill="none" strokeLinecap="round" />
                </>
              )}
            </g>
          </g>

          {/* Nez réaliste */}
          <path
            d="M200 214 C194 238 192 258 196 278 C198 284 202 284 204 278 C208 258 206 238 200 214 Z"
            fill="rgba(0,160,200,0.1)"
            stroke="rgba(0,210,240,0.22)"
            strokeWidth="0.5"
          />
          <path d="M186 278 Q200 288 214 278" stroke="rgba(0,200,230,0.18)" strokeWidth="0.7" fill="none" />
          <ellipse cx="192" cy="276" rx="4" ry="2.5" fill="rgba(0,220,255,0.08)" />
          <ellipse cx="208" cy="276" rx="4" ry="2.5" fill="rgba(0,220,255,0.08)" />

          {/* Joues */}
          <ellipse cx="132" cy="248" rx="20" ry="14" fill="rgba(0,255,255,0.05)" />
          <ellipse cx="268" cy="248" rx="20" ry="14" fill="rgba(0,255,255,0.05)" />

          {/* Lèvres animées */}
          <motion.path
            fill={`url(#lip-${uid})`}
            stroke="rgba(0,255,255,0.35)"
            strokeWidth="0.5"
            filter={`url(#soft-${uid})`}
            animate={{ d: mouthPaths }}
            transition={{
              duration: isSpeaking ? 0.14 : 0.3,
              repeat: isSpeaking ? Infinity : 0,
              ease: "easeInOut",
            }}
          />
          <motion.path
            fill="none"
            stroke="rgba(180,255,255,0.4)"
            strokeWidth="0.6"
            animate={{
              d: isSpeaking
                ? ["M182 318 Q200 322 218 318", "M184 316 Q200 328 216 316", "M182 318 Q200 322 218 318"]
                : "M182 322 Q200 326 218 322",
            }}
            transition={{ duration: isSpeaking ? 0.14 : 0.3, repeat: isSpeaking ? Infinity : 0 }}
          />

          {/* Reflet peau holographique */}
          <ellipse cx="168" cy="118" rx="32" ry="12" fill="rgba(255,255,255,0.05)" transform="rotate(-14 168 118)" />
          <path d="M128 108 Q200 82 272 108" stroke="rgba(100,255,255,0.2)" strokeWidth="1" fill="none" opacity="0.6" />
        </svg>

        <div className="ava-portrait-glow pointer-events-none absolute inset-0 z-0" aria-hidden />
      </motion.div>

      {showLabel && (
        <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[10px] tracking-[0.35em] text-cyan-400/50">
          A.V.A.
        </span>
      )}
    </motion.div>
  );
}
