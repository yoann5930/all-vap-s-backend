"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type LogoVariant =
  | "white"
  | "black"
  | "holo"
  | "glow"
  | "glass"
  | "mono"
  | "3d"
  | "official";

interface LogoMarkProps {
  variant?: LogoVariant;
  size?: number;
  animated?: boolean;
  className?: string;
  showWordmark?: boolean;
}

/**
 * Identité officielle All Vap's V1.0 — logo unique.
 * Les anciennes variantes (holo/glow…) mappent toutes vers le PNG officiel.
 */
export function LogoMark({
  variant = "official",
  size = 40,
  animated = false,
  className,
  showWordmark = false,
}: LogoMarkProps) {
  const h = size;
  const w = showWordmark ? Math.round(size * 2.2) : size;
  const invert = variant === "black";

  const img = (
    <Image
      src="/brand/logo-official.png"
      alt="All Vap's"
      width={w}
      height={h}
      className={cn(
        "object-contain",
        invert && "invert",
        className
      )}
      priority={size >= 64}
    />
  );

  if (!animated) {
    return (
      <span
        className={cn("inline-flex items-center justify-center", className)}
        style={{ width: w, height: h }}
        data-logo-variant={variant}
      >
        {img}
      </span>
    );
  }

  return (
    <motion.span
      className={cn("inline-flex items-center justify-center", className)}
      style={{ width: w, height: h }}
      data-logo-variant={variant}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.span
        animate={{ scale: [1, 1.015, 1] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
        className="inline-flex"
      >
        {img}
      </motion.span>
    </motion.span>
  );
}
