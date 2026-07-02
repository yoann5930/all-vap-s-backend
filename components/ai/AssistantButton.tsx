"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { useState } from "react";

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
      className="group fixed bottom-4 right-3 z-[60] flex flex-col items-center gap-1 sm:bottom-6 sm:right-6"
      initial={{ opacity: 0, y: 40, scale: 0.5 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.97 }}
    >
      <div className="ava-holo-shadow relative overflow-hidden rounded-full border border-cyan-500/25 p-0.5">
        <motion.div
          animate={
            speaking
              ? { boxShadow: ["0 0 20px rgba(0,212,255,0.3)", "0 0 36px rgba(0,212,255,0.55)", "0 0 20px rgba(0,212,255,0.3)"] }
              : { boxShadow: "0 0 18px rgba(0,212,255,0.2)" }
          }
          transition={{ duration: 1.2, repeat: speaking ? Infinity : 0 }}
          className="relative h-[72px] w-[72px] overflow-hidden rounded-full sm:h-[80px] sm:w-[80px]"
        >
          <Image
            src="/ava/ava-hologram-portrait.png"
            alt=""
            fill
            className="object-cover object-[center_20%] opacity-90 mix-blend-screen"
            sizes="80px"
            priority
          />
          <div className="pointer-events-none absolute inset-0 bg-cyan-400/10 mix-blend-screen" />
        </motion.div>
      </div>

      <motion.span
        className="rounded-full border border-cyan-500/30 bg-black/80 px-3 py-1 text-[11px] font-medium text-cyan-300/90 shadow-[0_0_20px_rgba(0,212,255,0.2)] backdrop-blur-md"
        animate={{ boxShadow: hovered ? "0 0 28px rgba(0,212,255,0.45)" : "0 0 16px rgba(0,212,255,0.2)" }}
      >
        Assistant IA · A.V.A.
      </motion.span>
    </motion.button>
  );
}
