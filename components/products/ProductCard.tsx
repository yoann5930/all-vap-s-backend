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
    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-wood-200/60 bg-white transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg">
      <Link href={`/boutique/${product.slug}`} className="group block flex-1">
        <div className="relative aspect-square bg-gray-100">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.name}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, 25vw"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <ShoppingBag className="h-12 w-12 text-gray-300" />
            </div>
          )}
          <div className="absolute left-2 top-2 flex flex-col gap-1">
            {product.isNew && <Badge className="bg-blue-600 text-white text-[10px]">Nouveau</Badge>}
            {hasPromo && <Badge variant="danger" className="text-[10px]">Promo</Badge>}
          </div>
          {product.stock === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <span className="rounded-full bg-white px-3 py-1 text-sm font-medium">Rupture</span>
            </div>
          )}
        </div>
        <div className="p-4">
          {product.brand && (
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{product.brand}</p>
          )}
          <h3 className="mt-1 line-clamp-2 font-semibold text-gray-900 group-hover:text-brand-700">{product.name}</h3>
          <div className="mt-3">
            <span className="text-lg font-bold text-brand-700">{formatPrice(price)}</span>
            {hasPromo && (
              <span className="ml-2 text-sm text-gray-400 line-through">{formatPrice(product.priceCents)}</span>
            )}
          </div>
        </div>
      </Link>
      {product.stock > 0 && (
        <div className="border-t border-wood-100 p-4 pt-3">
          <Button size="sm" className="w-full" onClick={handleAddToCart}>
            Ajouter
          </Button>
        </div>
      )}
    </article>
  );
}
