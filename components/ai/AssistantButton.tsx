"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { LogoMark } from "@/components/brand/LogoMark";

interface AssistantButtonProps {
  onClick: () => void;
  isOpen: boolean;
  speaking?: boolean;
}

export function AssistantButton({ onClick, isOpen, speaking = false }: AssistantButtonProps) {
  const [hovered, setHovered] = useState(false);

  if (isOpen) return null;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label="Ouvrir A.V.A. — conseillère virtuelle All Vap's"
      className="group fixed bottom-4 right-3 z-[60] flex flex-col items-center gap-2 sm:bottom-6 sm:right-6"
      initial={{ opacity: 0, y: 40, scale: 0.5 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.97 }}
    >
      <motion.div
        className="relative flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-2xl border border-brand-500/25 bg-premium-dark/80 p-3 backdrop-blur-xl sm:h-[5rem] sm:w-[5rem]"
        animate={
          speaking
            ? {
                boxShadow: [
                  "0 0 24px rgba(0,217,255,0.25)",
                  "0 0 48px rgba(0,217,255,0.45)",
                  "0 0 24px rgba(0,217,255,0.25)",
                ],
              }
            : { boxShadow: hovered ? "0 0 32px rgba(0,217,255,0.3)" : "0 0 20px rgba(0,217,255,0.15)" }
        }
        transition={{ duration: 1.2, repeat: speaking ? Infinity : 0 }}
      >
        <div className="absolute inset-0 rounded-2xl bg-brand-500/5" />
        <LogoMark variant="holo" size={52} />
      </motion.div>

      <motion.span
        className="rounded-full border border-brand-500/20 bg-premium-dark/90 px-3 py-1 text-[10px] font-light tracking-[0.12em] text-brand-400/90 backdrop-blur-md"
        animate={{ boxShadow: hovered ? "0 0 24px rgba(0,217,255,0.3)" : "0 0 12px rgba(0,217,255,0.1)" }}
      >
        A.V.A.
      </motion.span>
    </motion.button>
  );
}
