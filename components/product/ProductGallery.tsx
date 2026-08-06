"use client";

import { useState } from "react";
import { ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
import { isPreoptimizedProductMedia } from "@/lib/catalog/product-image-display";

interface ProductGalleryProps {
  name: string;
  imageUrl?: string | null;
  images?: string[];
}

/**
 * Packshots locaux : `<img>` direct (déjà WebP haute qualité).
 * Évite la 2e compression Next/Image (q=75) qui floutait les photos.
 */
function ProductPhoto({
  src,
  alt,
  priority,
  className,
}: {
  src: string;
  alt: string;
  priority?: boolean;
  className?: string;
}) {
  if (isPreoptimizedProductMedia(src)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- packshots déjà optimisés
      <img
        src={src}
        alt={alt}
        className={cn("absolute inset-0 h-full w-full", className)}
        decoding="async"
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
      />
    );
  }

  // Fallback distant : Next/Image (import dynamique évité — rare)
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={cn("absolute inset-0 h-full w-full", className)}
      decoding="async"
      loading={priority ? "eager" : "lazy"}
    />
  );
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
    <div className="space-y-4 p-2 sm:p-3">
      <div className="relative aspect-square overflow-hidden rounded-xl bg-[radial-gradient(ellipse_at_50%_42%,rgba(0,174,239,0.1),transparent_58%),#0B1016]">
        <ProductPhoto
          src={allImages[active]}
          alt={`${name} — photo ${active + 1}`}
          priority
          className="object-contain p-2 sm:p-3 transition-opacity duration-300"
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
              <ProductPhoto src={src} alt="" className="object-contain p-1" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
