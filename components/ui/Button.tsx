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
  primary: "bg-brand-600 text-white hover:bg-brand-700 focus:ring-brand-500 shadow-sm",
  secondary: "bg-vap-black text-white hover:bg-vap-charcoal focus:ring-vap-gray",
  outline: "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:ring-brand-500",
  "outline-light": "border border-white/30 bg-transparent text-white hover:bg-white/10 focus:ring-white/50",
  wood: "bg-wood-100 text-vap-charcoal hover:bg-wood-200 focus:ring-wood-400 border border-wood-200",
  ghost: "text-gray-700 hover:bg-gray-100 focus:ring-gray-500",
  danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500",
};

const sizes = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

const baseClassName =
  "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

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
