import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {}

export function Card({ className, children, ...props }: CardProps) {
  return (
    <div className={cn("premium-glass-light rounded-2xl", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: CardProps) {
  return (
    <div className={cn("border-b border-white/6 px-6 py-4", className)} {...props}>
      {children}
    </div>
  );
}

export function CardBody({ className, children, ...props }: CardProps) {
  return (
    <div className={cn("px-6 py-5", className)} {...props}>
      {children}
    </div>
  );
}
