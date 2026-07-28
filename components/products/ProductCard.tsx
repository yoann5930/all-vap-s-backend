"use client";

import Link from "next/link";
import Image from "next/image";
import { ShoppingBag } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { getEffectivePrice } from "@/lib/products/queries";
import { extractExplicitSpecs } from "@/lib/catalog/normalize";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { addToCart } from "@/lib/cart";
import { notifyCartUpdate } from "@/components/cart/CartProvider";
import type { Product } from "@prisma/client";

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const price = getEffectivePrice(product);
  const hasConfirmedPrice = price > 0;
  const hasPromo = Boolean(hasConfirmedPrice && product.isPromo && product.promoPriceCents);
  const specs = extractExplicitSpecs(`${product.name} ${product.description || ""}`);

  function handleAddToCart() {
    if (!hasConfirmedPrice) return;
    addToCart({
      productId: product.id,
      name: product.name,
      slug: product.slug,
      priceCents: price,
      imageUrl: product.imageUrl,
    });
    notifyCartUpdate();
  }

  return (
    <article className="premium-product-card group flex h-full flex-col bg-[#101720]">
      <Link href={`/boutique/${product.slug}`} className="block flex-1">
        <div className="relative aspect-square overflow-hidden bg-[#0B1016]">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.name}
              fill
              className="object-contain p-3 transition-transform duration-500 group-hover:scale-[1.03]"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
              <ShoppingBag className="h-12 w-12 text-white/15" strokeWidth={1.25} />
              <span className="text-[11px] text-[#A7B0BC]/60">Visuel à venir</span>
            </div>
          )}
          <div className="absolute left-3 top-3 flex flex-col gap-1.5">
            {product.isNew && <Badge className="text-[10px]">Nouveau</Badge>}
            {hasPromo && (
              <Badge variant="danger" className="text-[10px]">
                Promo
              </Badge>
            )}
            {product.stock === 0 && (
              <Badge variant="warning" className="text-[10px]">
                Rupture
              </Badge>
            )}
          </div>
          {product.stock === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-[2px]">
              <span className="rounded-full border border-white/20 bg-black/40 px-4 py-1.5 text-sm font-light text-white">
                Rupture
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col p-4 sm:p-5">
          {product.brand && (
            <p className="text-[10px] font-medium tracking-[0.16em] text-[#A7B0BC]/70 uppercase">
              {product.brand}
            </p>
          )}
          <h3 className="mt-1.5 line-clamp-2 font-display text-[15px] font-normal leading-snug text-[#F5F7FA] transition-colors group-hover:text-brand-400">
            {product.name}
          </h3>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {specs.nicotineMg != null && (
              <span className="rounded-md border border-white/8 bg-white/4 px-1.5 py-0.5 text-[10px] text-[#A7B0BC]">
                {specs.nicotineMg} mg
              </span>
            )}
            {specs.capacityMl != null && (
              <span className="rounded-md border border-white/8 bg-white/4 px-1.5 py-0.5 text-[10px] text-[#A7B0BC]">
                {specs.capacityMl} ml
              </span>
            )}
            {product.stock > 0 ? (
              <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300/90">
                En stock
              </span>
            ) : null}
          </div>

          <div className="mt-3 flex items-baseline gap-2">
            {hasConfirmedPrice ? (
              <>
                <span className="font-display text-lg font-medium text-brand-400">
                  {formatPrice(price)}
                </span>
                {hasPromo && (
                  <span className="text-sm font-light text-white/30 line-through">
                    {formatPrice(product.priceCents)}
                  </span>
                )}
              </>
            ) : (
              <span className="text-sm text-[#A7B0BC]">Prix en boutique</span>
            )}
          </div>
        </div>
      </Link>
      {product.stock > 0 && hasConfirmedPrice && (
        <div className="border-t border-white/6 p-4 pt-3">
          <Button size="sm" className="w-full" onClick={handleAddToCart}>
            Ajouter au panier
          </Button>
        </div>
      )}
    </article>
  );
}
