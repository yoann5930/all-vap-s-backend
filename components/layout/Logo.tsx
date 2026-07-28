"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  compact?: boolean;
  /** Conservé pour compatibilité — le wordmark maquette est toujours utilisé */
  variant?: string;
  size?: number;
  showWordmark?: boolean;
}

/** Wordmark header — aligné maquette ALL VAP'S + villes */
export function Logo({ className, compact = false }: LogoProps) {
  return (
    <Link
      href="/"
      className={cn(
        "group inline-flex flex-col justify-center leading-none transition-opacity hover:opacity-90",
        className
      )}
      aria-label="All Vap's — Accueil"
    >
      <span
        className={cn(
          "font-display font-bold tracking-[0.04em] text-white",
          compact ? "text-lg" : "text-[1.35rem] sm:text-[1.55rem]"
        )}
      >
        ALL VAP&apos;S
      </span>
      <span
        className={cn(
          "mt-1 font-medium tracking-[0.18em] text-[#A7B0BC]",
          compact ? "text-[8px]" : "text-[9px] sm:text-[10px]"
        )}
      >
        LE QUESNOY | HAUTMONT
      </span>
    </Link>
  );
}
