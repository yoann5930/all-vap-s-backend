"use client";

import { Sparkles } from "lucide-react";

interface HolographicAvatarProps {
  speaking?: boolean;
  size?: "sm" | "md" | "lg";
}

const sizes = {
  sm: { outer: "h-16 w-16", inner: "h-14 w-14", face: "text-2xl" },
  md: { outer: "h-24 w-24", inner: "h-20 w-20", face: "text-3xl" },
  lg: { outer: "h-32 w-32", inner: "h-28 w-28", face: "text-4xl" },
};

export function HolographicAvatar({ speaking = false, size = "md" }: HolographicAvatarProps) {
  const s = sizes[size];

  return (
    <div className={`relative flex items-center justify-center ${s.outer}`} aria-hidden>
      <div className="holo-particles absolute inset-0" />
      <div className={`holo-halo absolute inset-0 rounded-full ${speaking ? "holo-halo-active" : ""}`} />
      <div className={`holo-pulse absolute inset-1 rounded-full ${speaking ? "opacity-100" : "opacity-60"}`} />

      <div
        className={`relative ${s.inner} overflow-hidden rounded-full border border-brand-400/40 bg-gradient-to-b from-vap-gray/90 to-vap-black shadow-[0_0_30px_rgba(16,185,129,0.35)]`}
      >
        <div className="holo-scan absolute inset-0" />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-500/10 via-transparent to-brand-300/5" />

        <div className="relative flex h-full flex-col items-center justify-center">
          <div className={`${s.face} leading-none text-brand-300/90 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]`}>
            ◉
          </div>
          <div className="mt-1 flex gap-1">
            <span className={`h-1 w-1 rounded-full bg-brand-400 ${speaking ? "animate-pulse" : "opacity-50"}`} />
            <span className={`h-1 w-1 rounded-full bg-brand-300 ${speaking ? "animate-pulse animation-delay-100" : "opacity-40"}`} />
            <span className={`h-1 w-1 rounded-full bg-brand-500 ${speaking ? "animate-pulse animation-delay-200" : "opacity-30"}`} />
          </div>
        </div>
      </div>

      <Sparkles
        className="absolute -right-1 -top-1 h-4 w-4 text-brand-400/80 animate-pulse"
        strokeWidth={1.5}
      />
    </div>
  );
}
