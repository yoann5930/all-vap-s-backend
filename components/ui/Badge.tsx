import { clsx } from "clsx";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger";
  className?: string;
}

const variants = {
  default: "border border-brand-500/25 bg-brand-500/10 text-brand-300",
  success: "border border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  warning: "border border-amber-500/25 bg-amber-500/10 text-amber-300",
  danger: "border border-red-500/25 bg-red-500/10 text-red-300",
};

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-light tracking-wide",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
