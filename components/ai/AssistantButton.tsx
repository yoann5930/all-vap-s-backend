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
      aria-label="Ouvrir AVA — conseillère virtuelle All Vap's"
      className="group fixed bottom-4 right-3 z-[60] flex flex-col items-center gap-2 sm:bottom-6 sm:right-6"
      initial={{ opacity: 0, y: 40, scale: 0.5 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.4 }}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.97 }}
    >
      <motion.div
        className="relative flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-2xl border border-white/10 bg-[#0C0C0C]/90 p-3 backdrop-blur-xl sm:h-[5rem] sm:w-[5rem]"
        animate={
          speaking
            ? {
                boxShadow: [
                  "0 0 20px rgba(61,126,255,0.18)",
                  "0 0 36px rgba(61,126,255,0.32)",
                  "0 0 20px rgba(61,126,255,0.18)",
                ],
              }
            : {
                boxShadow: hovered
                  ? "0 0 28px rgba(61,126,255,0.25)"
                  : "0 0 16px rgba(61,126,255,0.12)",
              }
        }
        transition={{ duration: 1.2, repeat: speaking ? Infinity : 0 }}
      >
        <LogoMark variant="official" size={52} />
      </motion.div>

      <motion.span
        className="rounded-full border border-white/10 bg-[#0C0C0C]/90 px-3 py-1 text-[10px] font-light tracking-[0.16em] text-white/70 backdrop-blur-md"
        animate={{ opacity: hovered ? 1 : 0.85 }}
      >
        AVA
      </motion.span>
    </motion.button>
  );
}
