"use client";

import Link from "next/link";
import Image from "next/image";
import { ShoppingBag } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { getEffectivePrice } from "@/lib/products/queries";
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
  const hasPromo = product.isPromo && product.promoPriceCents;

  function handleAddToCart() {
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
    <article className="premium-product-card group flex h-full flex-col">
      <Link href={`/boutique/${product.slug}`} className="block flex-1">
        <div className="relative aspect-square overflow-hidden bg-premium-anthracite">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.name}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, 25vw"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <ShoppingBag className="h-12 w-12 text-white/15" strokeWidth={1.25} />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-premium-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <div className="absolute left-3 top-3 flex flex-col gap-1.5">
            {product.isNew && <Badge className="text-[10px]">Nouveau</Badge>}
            {hasPromo && <Badge variant="danger" className="text-[10px]">Promo</Badge>}
          </div>
          {product.stock === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <span className="rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm font-light text-white backdrop-blur-md">
                Rupture
              </span>
            </div>
          )}
        </div>
        <div className="p-5">
          {product.brand && (
            <p className="text-[10px] font-light tracking-[0.15em] text-white/35 uppercase">{product.brand}</p>
          )}
          <h3 className="mt-1.5 line-clamp-2 font-display text-base font-light text-white group-hover:text-brand-300 transition-colors">
            {product.name}
          </h3>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-display text-lg font-normal text-brand-400">{formatPrice(price)}</span>
            {hasPromo && (
              <span className="text-sm font-light text-white/30 line-through">{formatPrice(product.priceCents)}</span>
            )}
          </div>
        </div>
      </Link>
      {product.stock > 0 && (
        <div className="border-t border-white/6 p-4 pt-0">
          <Button size="sm" className="w-full" onClick={handleAddToCart}>
            Ajouter au panier
          </Button>
        </div>
      )}
    </article>
  );
}
