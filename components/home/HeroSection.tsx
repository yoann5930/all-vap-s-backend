"use client";

import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/Button";

export function HeroSection() {
  return (
    <section className="relative flex min-h-[88svh] items-center overflow-hidden lg:min-h-[78svh]">
      <div className="absolute inset-0 bg-[#05070A]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_40%,rgba(0,174,239,0.10)_0%,transparent_65%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_70%_60%,rgba(120,80,255,0.08)_0%,transparent_60%)]" />
      <div className="av-vapor pointer-events-none absolute inset-0 opacity-50" aria-hidden />

      <div className="relative z-10 mx-auto grid w-full max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:px-8 lg:py-20">
        <div className="text-left">
          <motion.p
            className="mb-4 text-xs font-medium uppercase tracking-[0.22em] text-brand-400/90"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            All Vap&apos;s · Hautmont &amp; Le Quesnoy
          </motion.p>

          <motion.h1
            className="font-display text-4xl font-semibold leading-[1.08] tracking-tight text-[#F5F7FA] sm:text-5xl lg:text-[3.25rem]"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            Découvrez nos{" "}
            <span className="bg-gradient-to-r from-brand-400 to-brand-600 bg-clip-text text-transparent">
              saveurs
            </span>
          </motion.h1>

          <motion.p
            className="mt-5 max-w-lg text-base font-light leading-relaxed text-[#A7B0BC] sm:text-lg"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.65 }}
          >
            E-liquides, pods et matériel sélectionnés — conseils en boutique et catalogue en ligne.
          </motion.p>

          <motion.div
            className="mt-9 flex flex-wrap items-center gap-3"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.65 }}
          >
            <Button href="/boutique" size="lg" variant="primary" className="gap-2">
              Voir le catalogue
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button href="/ia" size="lg" variant="secondary" className="gap-2">
              <Sparkles className="h-4 w-4" />
              A.V.A. — bientôt
            </Button>
          </motion.div>

          <motion.ul
            className="mt-10 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#A7B0BC]/90 sm:text-[13px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55, duration: 0.6 }}
          >
            <li>Dosages &amp; PG/VG indiqués</li>
            <li>Stock boutique réel</li>
            <li>Retrait gratuit en magasin</li>
          </motion.ul>
        </div>

        <motion.div
          className="relative mx-auto flex w-full max-w-md justify-center lg:max-w-none lg:justify-end"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="relative aspect-square w-full max-w-[420px]">
            <div className="absolute inset-6 rounded-full bg-[radial-gradient(circle,rgba(0,174,239,0.18)_0%,transparent_68%)] blur-2xl" aria-hidden />
            <Image
              src="/brand/logo-official-dark.png"
              alt="All Vap's"
              width={480}
              height={480}
              priority
              className="relative z-10 mx-auto h-auto w-full object-contain drop-shadow-[0_0_40px_rgba(0,174,239,0.2)]"
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
