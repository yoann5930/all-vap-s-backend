"use client";

import { motion } from "framer-motion";
import { ArrowRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LogoMark } from "@/components/brand/LogoMark";

export function HeroSection() {
  return (
    <section className="relative min-h-[85vh] overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-premium-black via-premium-dark to-premium-black" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_40%,rgba(0,217,255,0.08)_0%,transparent_70%)]" />
      <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-brand-500/25 to-transparent" />

      <div className="relative mx-auto flex min-h-[85vh] max-w-7xl flex-col items-center justify-center px-4 py-24 text-center sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          className="relative mb-10"
        >
          <div className="absolute inset-[-60%] rounded-full bg-brand-500/10 blur-3xl" />
          <LogoMark variant="glow" size={100} animated />
        </motion.div>

        <motion.p
          className="premium-section-label mb-4"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.8 }}
        >
          Boutique officielle
        </motion.p>

        <motion.h1
          className="font-display text-5xl font-extralight tracking-[0.06em] text-white sm:text-6xl lg:text-7xl"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1, duration: 0.9 }}
        >
          All Vap&apos;s
        </motion.h1>

        <motion.p
          className="premium-section-subtitle mx-auto mt-6 max-w-2xl text-base sm:text-lg"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 0.8 }}
        >
          L&apos;excellence de la vape premium. Cigarettes électroniques, e-liquides et accessoires
          dans vos boutiques All Vap&apos;s Hautmont et Le Quesnoy.
        </motion.p>

        <motion.div
          className="mt-12 flex flex-wrap items-center justify-center gap-4"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.4, duration: 0.8 }}
        >
          <Button href="/boutique" size="lg" variant="primary" className="gap-2">
            Découvrir la boutique
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button href="/boutiques" size="lg" variant="outline-light" className="gap-2">
            <MapPin className="h-4 w-4" />
            Nos magasins
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
