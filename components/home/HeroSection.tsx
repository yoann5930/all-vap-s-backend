"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

const BANNER_SRC = "/images/banners/allvaps-hero-banner.png";

/** Bannière All Vap's — pleine largeur, overlay 45 %, logo officiel */
export function HeroSection() {
  return (
    <section className="relative w-full overflow-hidden">
      <div className="relative h-[380px] w-full sm:h-[480px] lg:h-[650px]">
        <Image
          src={BANNER_SRC}
          alt="Collection e-liquides Ice Cool disponible chez All Vap's"
          fill
          priority
          className="object-cover object-center"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-black/45" aria-hidden />

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
            Découvrez nos saveurs
            <br />
            premium en boutique
          </motion.h1>

          <motion.p
            className="mt-4 max-w-lg text-sm font-light leading-relaxed text-white/90 sm:text-base"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.26, duration: 0.6 }}
          >
            E-liquides, cigarettes électroniques et accessoires sélectionnés par
            nos experts All Vap&apos;s.
          </motion.p>

          <motion.div
            className="mt-8"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.34, duration: 0.6 }}
          >
            <Link
              href="/boutique"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-500 px-7 text-sm font-bold tracking-wide text-[#05070A] shadow-[0_8px_32px_rgba(0,174,239,0.35)] transition-all duration-300 hover:bg-[#33C1F3] hover:shadow-[0_12px_40px_rgba(0,174,239,0.45)] active:scale-[0.98]"
            >
              Découvrir la boutique
              <ArrowRight className="h-4 w-4" />
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
