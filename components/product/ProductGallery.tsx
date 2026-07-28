"use client";

import { useState } from "react";
import Image from "next/image";
import { ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductGalleryProps {
  name: string;
  imageUrl?: string | null;
  images?: string[];
}

export function ProductGallery({ name, imageUrl, images = [] }: ProductGalleryProps) {
  const allImages = [...new Set([...(imageUrl ? [imageUrl] : []), ...images])];
  const [active, setActive] = useState(0);

  if (allImages.length === 0) {
    return (
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-[#0B1016]">
        <div className="flex h-full items-center justify-center">
          <ShoppingBag className="h-24 w-24 text-white/15" strokeWidth={1.25} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-3 sm:p-4">
      <div className="relative aspect-square overflow-hidden rounded-xl bg-[#0B1016]">
        <Image
          src={allImages[active]}
          alt={`${name} — photo ${active + 1}`}
          fill
          className="object-contain p-4 transition-opacity duration-300"
          priority
          sizes="(max-width: 1024px) 100vw, 50vw"
        />
      </div>

      {allImages.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {allImages.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setActive(i)}
              className={cn(
                "relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 bg-[#0B1016] transition-colors",
                active === i ? "border-brand-500" : "border-white/10 opacity-70 hover:opacity-100"
              )}
            >
              <Image src={src} alt="" fill className="object-contain p-1" sizes="64px" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
