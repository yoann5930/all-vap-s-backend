"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import Image from "next/image";

const SPLASH_KEY = "allvaps-splash-v2";

export function BrandSplash() {
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = sessionStorage.getItem(SPLASH_KEY);
    if (seen) return;
    setVisible(true);
    const t1 = setTimeout(() => setPhase("hold"), 600);
    const t2 = setTimeout(() => setPhase("out"), 2000);
    const t3 = setTimeout(() => {
      sessionStorage.setItem(SPLASH_KEY, "1");
      setVisible(false);
    }, 2600);
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
          className="fixed inset-0 z-[200] flex items-center justify-center bg-[#050505]"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          aria-hidden
        >
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="av-vapor absolute inset-0 opacity-40" />
          </div>

          <motion.div
            className="relative flex flex-col items-center"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{
              opacity: phase === "out" ? 0 : 1,
              scale: phase === "out" ? 1.02 : 1,
            }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          >
            <Image
              src="/brand/logo-official.png"
              alt=""
              width={280}
              height={280}
              priority
              className="h-auto w-[min(72vw,280px)] object-contain"
            />
            <motion.p
              className="mt-8 font-display text-xs font-light tracking-[0.4em] text-white/45 uppercase"
              initial={{ opacity: 0 }}
              animate={{ opacity: phase === "hold" || phase === "out" ? 1 : 0 }}
              transition={{ duration: 0.5 }}
            >
              All Vap&apos;s
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
