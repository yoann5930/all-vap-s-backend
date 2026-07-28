"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Droplets, FlaskConical, Flag } from "lucide-react";

/** Bannière e-liquides — sans panneau A.V.A. (placé en colonne droite) */
export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div className="relative min-h-[320px] overflow-hidden rounded-3xl border border-white/8 bg-[#0B1016]/55 lg:min-h-[400px]">
        <div className="absolute inset-0">
          <Image
            src="/brand/hero-eliquides-bottles.png"
            alt="Collection e-liquides Ice Cool Liquidarom"
            fill
            priority
            className="object-cover object-center opacity-90"
            sizes="(max-width: 1024px) 100vw, 75vw"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#05070A] via-[#05070A]/78 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#05070A]/75 via-transparent to-[#05070A]/25" />
        </div>

        <div className="relative z-10 flex h-full max-w-xl flex-col justify-center px-6 py-10 sm:px-10 lg:px-12">
          <motion.p
            className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-400"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            E-LIQUIDES
          </motion.p>

          <motion.h1
            className="mt-3 font-display text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-[3.25rem]"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
          >
            DÉCOUVREZ NOS
            <br />
            SAVEURS
          </motion.h1>

          <motion.p
            className="mt-3 text-lg font-semibold text-brand-400 sm:text-xl"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16 }}
          >
            + DE 250 RÉFÉRENCES
          </motion.p>

          <motion.ul
            className="mt-6 flex flex-wrap gap-2.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.24 }}
          >
            <li className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/35 px-3 py-1.5 text-[11px] text-[#D5DBE4] backdrop-blur-sm">
              <Droplets className="h-3.5 w-3.5 text-brand-400" />
              <span>
                <strong className="text-white">0 MG À 18 MG</strong>
                <span className="ml-1 text-[#A7B0BC]">De nicotine</span>
              </span>
            </li>
            <li className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/35 px-3 py-1.5 text-[11px] text-[#D5DBE4] backdrop-blur-sm">
              <FlaskConical className="h-3.5 w-3.5 text-brand-400" />
              <span>
                <strong className="text-white">PG/VG</strong>
                <span className="ml-1 text-[#A7B0BC]">50/50 à 100% VG</span>
              </span>
            </li>
            <li className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/35 px-3 py-1.5 text-[11px] text-[#D5DBE4] backdrop-blur-sm">
              <Flag className="h-3.5 w-3.5 text-brand-400" />
              <span>
                <strong className="text-white">FABRIQUÉS EN FRANCE</strong>
                <span className="ml-1 text-[#A7B0BC]">Qualité premium</span>
              </span>
            </li>
          </motion.ul>

          <motion.div
            className="mt-8"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.32 }}
          >
            <Link
              href="/e-liquides"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-500 px-6 text-sm font-bold tracking-wide text-premium-black transition-colors hover:bg-brand-400"
            >
              VOIR LA COLLECTION
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
