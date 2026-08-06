"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

/**
 * Bandeau principal événementiel / institutionnel.
 * Aucun produit automatique — esthétique premium All Vap's conservée.
 */
export function HeroSection() {
  return (
    <section className="relative w-full overflow-hidden">
      <div className="relative h-[380px] w-full sm:h-[480px] lg:h-[560px]">
        <div
          className="absolute inset-0 bg-[#05070A]"
          aria-hidden
        />
        <div
          className="absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(ellipse 70% 55% at 70% 40%, rgba(0,174,239,0.22) 0%, transparent 55%), radial-gradient(ellipse 50% 40% at 20% 70%, rgba(0,174,239,0.08) 0%, transparent 50%)",
          }}
          aria-hidden
        />
        <div className="av-vapor absolute inset-0 opacity-50" aria-hidden />

        <div className="relative z-10 mx-auto flex h-full max-w-[1400px] flex-col justify-center px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <Image
              src="/brand/logo-official-dark.png"
              alt="All Vap's"
              width={72}
              height={72}
              className="h-14 w-14 object-contain sm:h-16 sm:w-16 lg:h-[72px] lg:w-[72px]"
              priority
            />
          </motion.div>

          <motion.p
            className="mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-white/80"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.6 }}
          >
            Boutique officielle · Hautmont &amp; Le Quesnoy
          </motion.p>

          <motion.h1
            className="mt-3 max-w-2xl font-display text-3xl font-bold leading-[1.08] tracking-tight text-white sm:text-4xl lg:text-5xl"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.65 }}
          >
            All Vap&apos;s
            <br />
            votre expert vape
          </motion.h1>

          <motion.p
            className="mt-4 max-w-lg text-sm font-light leading-relaxed text-white/90 sm:text-base"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.26, duration: 0.6 }}
          >
            Conseils en boutique, sélection validée et accompagnement A.V.A.
            Le catalogue en ligne se reconstruit référence par référence.
          </motion.p>

          <motion.div
            className="mt-8 flex flex-wrap gap-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.34, duration: 0.6 }}
          >
            <Link
              href="/boutiques"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-500 px-7 text-sm font-bold tracking-wide text-[#05070A] shadow-[0_8px_32px_rgba(0,174,239,0.35)] transition-all duration-300 hover:bg-[#33C1F3]"
            >
              Nos boutiques
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/e-liquides"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/20 px-7 text-sm font-semibold text-white transition hover:border-brand-400 hover:text-brand-400"
            >
              E-liquides
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
