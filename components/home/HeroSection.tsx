"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Droplets, FlaskConical, Flag } from "lucide-react";

/** Bannière Liquidarom Ice Cool — photo de gamme officielle */
export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div className="relative min-h-[340px] overflow-hidden rounded-3xl border border-white/8 bg-[#0B1016]/55 lg:min-h-[420px]">
        <div className="absolute inset-0">
          <Image
            src="/products/liquidarom/hero-liquidarom-ice-cool.webp"
            alt="Collection de e-liquides Liquidarom Ice Cool disponible chez All Vap's"
            fill
            priority
            className="object-cover object-center"
            sizes="(max-width: 1024px) 100vw, 75vw"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#05070A] via-[#05070A]/82 to-[#05070A]/25" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#05070A]/80 via-transparent to-[#05070A]/30" />
        </div>

        <div className="relative z-10 flex h-full max-w-xl flex-col justify-center px-6 py-10 sm:px-10 lg:px-12">
          <motion.p
            className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-400"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            LIQUIDAROM · ICE COOL
          </motion.p>

          <motion.h1
            className="mt-3 font-display text-3xl font-bold leading-[1.08] tracking-tight text-white sm:text-4xl lg:text-[2.75rem]"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
          >
            Découvrez les saveurs
            <br />
            Liquidarom Ice Cool
          </motion.h1>

          <motion.p
            className="mt-4 max-w-md text-sm font-light leading-relaxed text-[#D5DBE4] sm:text-base"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16 }}
          >
            Des recettes fruitées, fraîches et disponibles dans nos boutiques All Vap&apos;s.
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
                <strong className="text-white">EN BOUTIQUE</strong>
                <span className="ml-1 text-[#A7B0BC]">Hautmont &amp; Le Quesnoy</span>
              </span>
            </li>
          </motion.ul>

          <motion.div
            className="mt-8 flex flex-wrap gap-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.32 }}
          >
            <Link
              href="/boutique?category=e-liquides&brand=liquidarom"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-500 px-6 text-sm font-bold tracking-wide text-premium-black transition-colors hover:bg-brand-400"
            >
              Voir la collection
            </Link>
            <Link
              href="/boutique?search=Ice%20Cool"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-6 text-sm font-semibold text-white transition-colors hover:border-brand-500/40 hover:bg-brand-500/10"
            >
              Trouver ma saveur
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
