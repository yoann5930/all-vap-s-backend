"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

interface FavoriteButtonProps {
  productId: string;
  className?: string;
}

export function FavoriteButton({ productId, className }: FavoriteButtonProps) {
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    try {
      if (active) {
        await fetch(`/api/favorites?productId=${productId}`, { method: "DELETE" });
        setActive(false);
      } else {
        const res = await fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId }),
        });
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        setActive(true);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-lg border transition-colors",
        active ? "border-red-200 bg-red-50 text-red-500" : "border-gray-200 text-gray-400 hover:border-red-200 hover:text-red-500",
        className
      )}
      aria-label={active ? "Retirer des favoris" : "Ajouter aux favoris"}
    >
      <Heart className={cn("h-5 w-5", active && "fill-current")} />
    </button>
  );
}
