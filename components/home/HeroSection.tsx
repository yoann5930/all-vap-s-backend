"use client";

import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/Button";

function openAva() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("allvaps:open-ava"));
  }
}

export function HeroSection() {
  return (
    <section className="relative flex min-h-[100svh] items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-[#050505]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_45%,rgba(61,126,255,0.06)_0%,transparent_65%)]" />
      <div className="av-vapor pointer-events-none absolute inset-0 opacity-50" aria-hidden />

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center px-4 py-28 text-center sm:px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          className="mb-10"
        >
          <Image
            src="/brand/logo-official.png"
            alt="All Vap's"
            width={360}
            height={360}
            priority
            className="mx-auto h-auto w-[min(78vw,340px)] object-contain"
          />
        </motion.div>

        <motion.p
          className="max-w-md text-sm font-light leading-relaxed tracking-wide text-[#8A8A8E] sm:text-base"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          L&apos;excellence de la vape, en ligne et en boutique.
        </motion.p>

        <motion.div
          className="mt-12 flex flex-wrap items-center justify-center gap-3 sm:gap-4"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <Button href="/boutique" size="lg" variant="primary" className="gap-2">
            Découvrir la boutique
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="lg"
            variant="outline-light"
            className="gap-2"
            onClick={openAva}
          >
            <Sparkles className="h-4 w-4" />
            Parler avec AVA
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
