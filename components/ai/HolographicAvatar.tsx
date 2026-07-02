"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useMouseTracking } from "@/hooks/useMouseTracking";
import { Particles } from "@/components/ai/Particles";

export interface HolographicAvatarProps {
  speaking?: boolean;
  hovered?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  interactive?: boolean;
  showLabel?: boolean;
  className?: string;
}

const sizeMap = {
  sm: { box: 64, scale: 0.55 },
  md: { box: 96, scale: 0.75 },
  lg: { box: 128, scale: 1 },
  xl: { box: 160, scale: 1.25 },
};

export function HolographicAvatar({
  speaking = false,
  hovered = false,
  size = "lg",
  interactive = true,
  showLabel = false,
  className = "",
}: HolographicAvatarProps) {
  const { box, scale } = sizeMap[size];
  const mouse = useMouseTracking(interactive && size !== "sm");
  const [blink, setBlink] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const blinkLoop = () => {
      if (Math.random() > 0.7) {
        setBlink(true);
        setTimeout(() => setBlink(false), 120);
      }
      return setTimeout(blinkLoop, 2200 + Math.random() * 3000);
    };
    const t = blinkLoop();
    return () => clearTimeout(t);
  }, []);

  const rotateY = mouse.x * (hovered ? 14 : 8);
  const rotateX = -mouse.y * (hovered ? 10 : 6);
  const eyeOffsetX = mouse.x * 3;
  const eyeOffsetY = mouse.y * 2;

  return (
    <motion.div
      className={`ava-holo-root relative ${className}`}
      style={{ width: box, height: box }}
      initial={mounted ? { opacity: 0, scale: 0.3, filter: "blur(8px)" } : false}
      animate={{
        opacity: 1,
        scale: 1,
        filter: "blur(0px)",
        y: [0, -4, 0],
      }}
      transition={{
        opacity: { duration: 1.2, ease: "easeOut" },
        scale: { duration: 1, ease: [0.16, 1, 0.3, 1] },
        filter: { duration: 1 },
        y: { duration: 4, repeat: Infinity, ease: "easeInOut" },
      }}
    >
      <Particles count={size === "xl" ? 36 : 22} className="rounded-full" />

      <motion.div
        className="ava-holo-halo absolute inset-[-12%] rounded-full"
        animate={{ rotate: 360, opacity: speaking ? [0.6, 1, 0.6] : [0.35, 0.55, 0.35] }}
        transition={{
          rotate: { duration: speaking ? 6 : 12, repeat: Infinity, ease: "linear" },
          opacity: { duration: speaking ? 1.2 : 3, repeat: Infinity },
        }}
      />

      <motion.div
        className="ava-holo-pulse absolute inset-[-6%] rounded-full"
        animate={{ scale: speaking ? [1, 1.12, 1] : [1, 1.06, 1] }}
        transition={{ duration: speaking ? 0.8 : 2.5, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        className="ava-holo-scan absolute inset-0 overflow-hidden rounded-full"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.8 }}
      />

      <motion.div
        className="relative h-full w-full will-change-transform"
        style={{ perspective: 600, transformStyle: "preserve-3d" }}
        animate={{
          rotateY,
          rotateX,
          scale: hovered ? 1.04 : 1,
        }}
        transition={{ type: "spring", stiffness: 120, damping: 18 }}
      >
        <svg
          viewBox="0 0 200 240"
          className="h-full w-full drop-shadow-[0_0_24px_rgba(0,212,255,0.5)]"
          style={{ transform: `scale(${scale})`, transformOrigin: "center" }}
          aria-hidden
        >
          <defs>
            <linearGradient id="avaFaceGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(0,212,255,0.35)" />
              <stop offset="50%" stopColor="rgba(0,180,220,0.15)" />
              <stop offset="100%" stopColor="rgba(0,100,140,0.05)" />
            </linearGradient>
            <filter id="avaGlow">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <clipPath id="avaHeadClip">
              <ellipse cx="100" cy="108" rx="62" ry="72" />
            </clipPath>
          </defs>

          {/* Wireframe mesh */}
          <g clipPath="url(#avaHeadClip)" opacity="0.45" stroke="rgba(0,212,255,0.5)" strokeWidth="0.6" fill="none">
            {Array.from({ length: 8 }).map((_, i) => (
              <line key={`h${i}`} x1="38" y1={60 + i * 14} x2="162" y2={60 + i * 14} />
            ))}
            {Array.from({ length: 7 }).map((_, i) => (
              <line key={`v${i}`} x1={50 + i * 16} y1="55" x2={50 + i * 16} y2="175" />
            ))}
            <ellipse cx="100" cy="108" rx="62" ry="72" />
            <path d="M70 90 Q100 75 130 90" />
            <path d="M75 130 Q100 145 125 130" />
          </g>

          {/* Face fill */}
          <ellipse cx="100" cy="108" rx="62" ry="72" fill="url(#avaFaceGrad)" stroke="rgba(0,212,255,0.6)" strokeWidth="1.2" />

          {/* Light lines */}
          <motion.path
            d="M55 95 Q100 70 145 95"
            fill="none"
            stroke="rgba(0,255,255,0.7)"
            strokeWidth="1.5"
            filter="url(#avaGlow)"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <motion.path
            d="M60 140 Q100 160 140 140"
            fill="none"
            stroke="rgba(0,212,255,0.5)"
            strokeWidth="1"
            animate={{ opacity: [0.3, 0.8, 0.3] }}
            transition={{ duration: 2.5, repeat: Infinity, delay: 0.5 }}
          />

          {/* Eyes */}
          <g transform={`translate(${eyeOffsetX}, ${eyeOffsetY})`}>
            <ellipse cx="78" cy="102" rx="10" ry={blink ? 1 : 8} fill="rgba(0,212,255,0.9)" />
            <ellipse cx="122" cy="102" rx="10" ry={blink ? 1 : 8} fill="rgba(0,212,255,0.9)" />
            {!blink && (
              <>
                <circle cx="80" cy="100" r="3" fill="rgba(200,255,255,0.95)" />
                <circle cx="124" cy="100" r="3" fill="rgba(200,255,255,0.95)" />
              </>
            )}
          </g>

          {/* Nose */}
          <line x1="100" y1="108" x2="100" y2="125" stroke="rgba(0,212,255,0.4)" strokeWidth="1" />

          {/* Mouth / lips */}
          <motion.path
            d={speaking || hovered ? "M82 138 Q100 148 118 138" : "M85 138 Q100 142 115 138"}
            fill="none"
            stroke="rgba(0,255,255,0.8)"
            strokeWidth="1.5"
            strokeLinecap="round"
            animate={
              speaking
                ? {
                    d: [
                      "M82 138 Q100 148 118 138",
                      "M84 136 Q100 152 116 136",
                      "M82 138 Q100 148 118 138",
                    ],
                  }
                : {}
            }
            transition={{ duration: 0.35, repeat: speaking ? Infinity : 0 }}
          />

          {/* Shoulders hint */}
          <path
            d="M45 175 Q100 195 155 175"
            fill="none"
            stroke="rgba(0,212,255,0.25)"
            strokeWidth="1"
          />

          {/* Reflection */}
          <ellipse cx="75" cy="85" rx="18" ry="8" fill="rgba(255,255,255,0.08)" transform="rotate(-20 75 85)" />
        </svg>
      </motion.div>

      {showLabel && (
        <motion.span
          className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-semibold tracking-widest text-cyan-300/90"
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          A.V.A.
        </motion.span>
      )}
    </motion.div>
  );
}
