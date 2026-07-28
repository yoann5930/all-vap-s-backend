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
    "min-h-11 border border-[rgba(0,174,239,0.35)] bg-[rgba(0,174,239,0.16)] text-[#E8F8FE] shadow-[0_0_24px_rgba(0,174,239,0.16)] hover:border-[rgba(0,174,239,0.55)] hover:bg-[rgba(17,141,255,0.28)] hover:text-white hover:shadow-[0_0_32px_rgba(0,174,239,0.28)] active:scale-[0.98]",
  secondary:
    "min-h-11 border border-[rgba(0,174,239,0.28)] bg-premium-dark text-white hover:border-[rgba(0,174,239,0.45)] hover:bg-[#151D27] active:scale-[0.98]",
  outline:
    "min-h-11 border border-white/15 bg-transparent text-white/80 hover:border-[rgba(0,174,239,0.35)] hover:text-brand-400 active:scale-[0.98]",
  "outline-light":
    "min-h-11 border border-white/20 bg-transparent text-white/90 hover:border-[rgba(0,174,239,0.4)] hover:bg-[rgba(0,174,239,0.08)] hover:text-white active:scale-[0.98]",
  wood: "min-h-11 border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 active:scale-[0.98]",
  ghost: "min-h-11 text-white/60 hover:bg-white/5 hover:text-white active:scale-[0.98]",
  danger: "min-h-11 bg-[#FF4D5E]/90 text-white hover:bg-[#FF4D5E] active:scale-[0.98]",
};

const sizes = {
  sm: "px-3.5 py-2 text-sm",
  md: "px-5 py-2.5 text-sm",
  lg: "px-7 py-3.5 text-base",
};

const baseClassName =
  "inline-flex items-center justify-center rounded-xl font-light tracking-wide transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(0,174,239,0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-premium-black disabled:cursor-not-allowed disabled:opacity-40 hover:-translate-y-0.5";

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
