import Link from "next/link";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  variant?: "light" | "dark";
}

export function Logo({ className, variant = "light" }: LogoProps) {
  return (
    <Link href="/" className={cn("group flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg font-bold text-sm transition-transform group-hover:scale-105",
          variant === "light"
            ? "bg-brand-600 text-white shadow-lg shadow-brand-600/30"
            : "bg-brand-600 text-white"
        )}
        aria-hidden="true"
      >
        AV
      </span>
      <span
        className={cn(
          "text-lg font-bold tracking-tight sm:text-xl",
          variant === "light" ? "text-white" : "text-vap-black"
        )}
      >
        All Vap&apos;s
      </span>
    </Link>
  );
}
