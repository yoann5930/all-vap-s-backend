import Link from "next/link";
import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "outline-light" | "wood" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  href?: string;
}

const variants = {
  primary:
    "border border-brand-500/30 bg-brand-500/10 text-brand-300 shadow-[0_0_24px_rgba(0,217,255,0.12)] hover:border-brand-400/50 hover:bg-brand-500/20 hover:text-white hover:shadow-[0_0_32px_rgba(0,217,255,0.25)] active:scale-[0.98]",
  secondary:
    "border border-white/10 bg-white/5 text-white hover:border-white/20 hover:bg-white/10 active:scale-[0.98]",
  outline:
    "border border-white/15 bg-transparent text-white/80 hover:border-brand-500/30 hover:text-brand-300 active:scale-[0.98]",
  "outline-light":
    "border border-white/20 bg-transparent text-white/90 hover:border-brand-400/40 hover:bg-brand-500/5 hover:text-brand-300 active:scale-[0.98]",
  wood: "border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 active:scale-[0.98]",
  ghost: "text-white/60 hover:bg-white/5 hover:text-white active:scale-[0.98]",
  danger: "bg-red-600/90 text-white hover:bg-red-600 active:scale-[0.98]",
};

const sizes = {
  sm: "px-3.5 py-2 text-sm",
  md: "px-5 py-2.5 text-sm",
  lg: "px-7 py-3.5 text-base",
};

const baseClassName =
  "inline-flex items-center justify-center rounded-xl font-light tracking-wide transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-premium-black disabled:cursor-not-allowed disabled:opacity-40 hover:-translate-y-0.5";

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, disabled, href, children, ...props }, ref) => {
    const classes = cn(baseClassName, variants[variant], sizes[size], className);

    if (href) {
      return (
        <Link href={href} className={classes}>
          {loading ? "Chargement..." : children}
        </Link>
      );
    }

    return (
      <button ref={ref} disabled={disabled || loading} className={classes} {...props}>
        {loading ? "Chargement..." : children}
      </button>
    );
  }
);

Button.displayName = "Button";
