"use client";

import { useEffect, useState } from "react";

interface MouseOffset {
  x: number;
  y: number;
}

export function useMouseTracking(enabled = true): MouseOffset {
  const [offset, setOffset] = useState<MouseOffset>({ x: 0, y: 0 });

  useEffect(() => {
    if (!enabled) return;

    const handleMove = (e: MouseEvent) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const x = Math.max(-1, Math.min(1, (e.clientX - cx) / cx));
      const y = Math.max(-1, Math.min(1, (e.clientY - cy) / cy));
      setOffset({ x, y });
    };

    window.addEventListener("mousemove", handleMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMove);
  }, [enabled]);

  return offset;
}
