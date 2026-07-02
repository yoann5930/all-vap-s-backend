"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/brand/LogoMark";

const SPLASH_KEY = "allvaps-splash-v1";

export function BrandSplash() {
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<"draw" | "sweep" | "exit">("draw");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = sessionStorage.getItem(SPLASH_KEY);
    if (seen) return;
    setVisible(true);
    const t1 = setTimeout(() => setPhase("sweep"), 1400);
    const t2 = setTimeout(() => setPhase("exit"), 2400);
    const t3 = setTimeout(() => {
      sessionStorage.setItem(SPLASH_KEY, "1");
      setVisible(false);
    }, 2800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="brand-splash fixed inset-0 z-[200] flex items-center justify-center bg-[#050505]"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          aria-hidden
        >
          <div className="brand-splash-particles pointer-events-none absolute inset-0" />
          <div className="brand-splash-halo pointer-events-none absolute h-[420px] w-[420px] rounded-full" />

          <div className="relative flex flex-col items-center">
            <LogoMark variant="holo" size={120} animated showWordmark={false} />

            <motion.div
              className="pointer-events-none absolute inset-[-40%] overflow-hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: phase !== "draw" ? 1 : 0 }}
              transition={{ duration: 0.4 }}
            >
              <motion.div
                className="brand-splash-sweep h-full w-[40%]"
                initial={{ x: "-120%" }}
                animate={{ x: phase === "sweep" || phase === "exit" ? "320%" : "-120%" }}
                transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
              />
            </motion.div>

            <motion.p
              className="mt-8 font-display text-sm font-light tracking-[0.35em] text-white/50 uppercase"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: phase === "sweep" ? 1 : 0, y: phase === "sweep" ? 0 : 8 }}
              transition={{ duration: 0.6 }}
            >
              All Vap&apos;s
            </motion.p>
          </div>

          <div className="brand-splash-smoke pointer-events-none absolute inset-0" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
