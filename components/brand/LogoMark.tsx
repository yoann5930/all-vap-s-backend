"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type LogoVariant =
  | "white"
  | "black"
  | "holo"
  | "glow"
  | "glass"
  | "mono"
  | "3d";

interface LogoMarkProps {
  variant?: LogoVariant;
  size?: number;
  animated?: boolean;
  className?: string;
  showWordmark?: boolean;
}

const strokeColors: Record<LogoVariant, { a: string; bar: string; v: string; text: string }> = {
  white: { a: "#00D9FF", bar: "#00D9FF", v: "#FFFFFF", text: "#FFFFFF" },
  black: { a: "#050505", bar: "#050505", v: "#1A1A1A", text: "#050505" },
  holo: { a: "url(#logo-holo-grad)", bar: "url(#logo-holo-grad)", v: "#5EF4FF", text: "url(#logo-holo-grad)" },
  glow: { a: "#5EF4FF", bar: "#00D9FF", v: "#7CF7FF", text: "#5EF4FF" },
  glass: { a: "rgba(255,255,255,0.85)", bar: "rgba(94,244,255,0.9)", v: "rgba(255,255,255,0.7)", text: "rgba(255,255,255,0.92)" },
  mono: { a: "#FFFFFF", bar: "#FFFFFF", v: "#FFFFFF", text: "#FFFFFF" },
  "3d": { a: "#00D9FF", bar: "#5EF4FF", v: "#7CF7FF", text: "#FFFFFF" },
};

export function LogoMark({
  variant = "holo",
  size = 40,
  animated = false,
  className,
  showWordmark = false,
}: LogoMarkProps) {
  const c = strokeColors[variant];
  const h = showWordmark ? size * 0.32 : size;
  const w = showWordmark ? size * 2.8 : size;

  const pathA = "M 8 52 L 28 12 L 48 52";
  const pathBar = "M 16 38 L 40 38";
  const pathV = "M 28 12 L 36 52";

  const draw = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: (i: number) => ({
      pathLength: 1,
      opacity: 1,
      transition: { duration: 0.9, delay: i * 0.35, ease: "easeOut" as const },
    }),
  };

  return (
    <svg
      width={w}
      height={h}
      viewBox={showWordmark ? "0 0 280 64" : "0 0 56 64"}
      fill="none"
      className={cn("shrink-0", className)}
      aria-hidden={!showWordmark}
    >
      <defs>
        <linearGradient id="logo-holo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7CF7FF" />
          <stop offset="50%" stopColor="#00D9FF" />
          <stop offset="100%" stopColor="#5EF4FF" />
        </linearGradient>
        {variant === "3d" && (
          <filter id="logo-3d-glow">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#00D9FF" floodOpacity="0.45" />
          </filter>
        )}
        {variant === "glow" && (
          <filter id="logo-glow-filter">
            <feGaussianBlur stdDeviation="1.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>

      <g filter={variant === "3d" ? "url(#logo-3d-glow)" : variant === "glow" ? "url(#logo-glow-filter)" : undefined}>
        {animated ? (
          <>
            <motion.path d={pathA} stroke={c.a} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" variants={draw} custom={0} initial="hidden" animate="visible" />
            <motion.path d={pathBar} stroke={c.bar} strokeWidth="2.2" strokeLinecap="round" variants={draw} custom={1} initial="hidden" animate="visible" />
            <motion.path d={pathV} stroke={c.v} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" variants={draw} custom={2} initial="hidden" animate="visible" />
          </>
        ) : (
          <>
            <path d={pathA} stroke={c.a} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d={pathBar} stroke={c.bar} strokeWidth="2.2" strokeLinecap="round" />
            <path d={pathV} stroke={c.v} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
      </g>

      {showWordmark && (
        <text
          x="62"
          y="42"
          fill={c.text}
          fontFamily="var(--font-display), Inter, system-ui, sans-serif"
          fontSize="28"
          fontWeight="300"
          letterSpacing="0.08em"
        >
          All Vap&apos;s
        </text>
      )}
    </svg>
  );
}
