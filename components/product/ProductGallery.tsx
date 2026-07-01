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
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-gray-100">
        <div className="flex h-full items-center justify-center">
          <ShoppingBag className="h-24 w-24 text-gray-300" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-gray-100">
        <Image
          src={allImages[active]}
          alt={`${name} — photo ${active + 1}`}
          fill
          className="object-cover transition-opacity duration-300"
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
                "relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 transition-colors",
                active === i ? "border-brand-500" : "border-transparent opacity-70 hover:opacity-100"
              )}
            >
              <Image src={src} alt="" fill className="object-cover" sizes="64px" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
