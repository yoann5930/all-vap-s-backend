import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="mb-1.5 block text-sm font-light text-white/60">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "premium-input block w-full rounded-xl px-4 py-2.5 text-sm font-light",
            error && "border-red-500/50 focus:border-red-500/50 focus:ring-red-500/30",
            className
          )}
          {...props}
        />
        {error && <p className="mt-1 text-sm font-light text-red-400">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
