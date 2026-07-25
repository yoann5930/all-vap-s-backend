import Link from "next/link";
import { cn } from "@/lib/utils";
import { LogoMark, type LogoVariant } from "@/components/brand/LogoMark";

interface LogoProps {
  className?: string;
  variant?: LogoVariant;
  showWordmark?: boolean;
  size?: number;
}

export function Logo({
  className,
  variant = "official",
  showWordmark = true,
  size = 44,
}: LogoProps) {
  return (
    <Link
      href="/"
      className={cn("group inline-flex items-center gap-3 transition-opacity hover:opacity-90", className)}
      aria-label="All Vap's — Accueil"
    >
      <LogoMark
        variant={variant}
        size={size}
        showWordmark={showWordmark}
        className="transition-transform duration-500 group-hover:scale-[1.02]"
      />
    </Link>
  );
}
