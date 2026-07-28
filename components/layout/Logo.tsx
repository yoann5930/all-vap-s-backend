"use client";

import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  compact?: boolean;
  variant?: string;
  size?: number;
  showWordmark?: boolean;
}

/** Logo officiel All Vap's + wordmark maquette */
export function Logo({ className, compact = false, size }: LogoProps) {
  const mark = size ?? (compact ? 36 : 44);

  return (
    <Link
      href="/"
      className={cn(
        "group inline-flex items-center gap-2.5 transition-opacity hover:opacity-90 sm:gap-3",
        className
      )}
      aria-label="All Vap's — Accueil"
    >
      <Image
        src="/brand/logo-official-dark.png"
        alt="All Vap's"
        width={mark}
        height={mark}
        className="h-auto w-auto object-contain"
        priority
      />
      <span className="flex flex-col justify-center leading-none">
        <span
          className={cn(
            "font-display font-bold tracking-[0.04em] text-white",
            compact ? "text-base" : "text-[1.2rem] sm:text-[1.4rem]"
          )}
        >
          ALL VAP&apos;S
        </span>
        <span
          className={cn(
            "mt-1 font-medium tracking-[0.16em] text-[#A7B0BC]",
            compact ? "text-[7px]" : "text-[8px] sm:text-[9px]"
          )}
        >
          LE QUESNOY | HAUTMONT
        </span>
      </span>
    </Link>
  );
}
