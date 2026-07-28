"use client";

import Link from "next/link";
import Image from "next/image";
import { ShoppingCart } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { getEffectivePrice } from "@/lib/products/queries";
import { extractExplicitSpecs } from "@/lib/catalog/normalize";
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
  const shortName = product.name.replace(/^Ice Cool X\s*[-–—]\s*/i, "").trim();

  function handleAddToCart(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
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
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-white/8 bg-[#101720] transition-all duration-300 hover:border-brand-500/35 hover:shadow-[0_0_28px_rgba(0,174,239,0.12)]">
      <Link href={`/boutique/${product.slug}`} className="block flex-1">
        <div className="relative aspect-[4/5] overflow-hidden bg-[#0B1016]">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.name}
              fill
              className="object-contain p-3 transition-transform duration-500 group-hover:scale-[1.04]"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
              loading="lazy"
            />
          ) : (
            <div className="relative flex h-full flex-col items-center justify-center gap-2 bg-[radial-gradient(circle_at_50%_30%,rgba(0,174,239,0.12),transparent_60%)] px-4 text-center">
              <Image
                src="/brand/logo-official-dark.png"
                alt=""
                width={48}
                height={48}
                className="opacity-40"
                aria-hidden
              />
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#A7B0BC]/80">
                {product.brand || "All Vap's"}
              </p>
              <p className="text-[11px] text-[#A7B0BC]/55">Photo produit à venir</p>
            </div>
          )}
          <div className="absolute left-2.5 top-2.5 flex flex-col gap-1.5">
            {(product.isNew || product.source === "liquidarom") && (
              <Badge className="text-[10px]">Nouveau</Badge>
            )}
            {hasPromo && (
              <Badge variant="danger" className="text-[10px]">
                Promo
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col px-3 pb-3 pt-3 sm:px-3.5">
          <h3 className="line-clamp-2 min-h-[2.5rem] text-[13px] font-semibold leading-snug text-[#F5F7FA] transition-colors group-hover:text-brand-400">
            {shortName}
          </h3>
          {product.brand && (
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#A7B0BC]/75">
              {product.brand}
            </p>
          )}
          <p className="mt-1 text-[11px] text-[#A7B0BC]">
            {specs.nicotineMg != null ? `${specs.nicotineMg} mg/ml` : "0 mg/ml"}
            {specs.capacityMl != null ? ` · ${specs.capacityMl} ml` : " · 50 ml"}
          </p>
        </div>
      </Link>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-white/6 px-3 py-2.5 sm:px-3.5">
        <div className="min-w-0">
          {hasConfirmedPrice ? (
            <span className="font-display text-[15px] font-semibold text-white">
              {formatPrice(price)}
            </span>
          ) : (
            <span className="text-[12px] font-medium text-[#A7B0BC]">Prix en boutique</span>
          )}
        </div>
        <button
          type="button"
          onClick={handleAddToCart}
          disabled={!hasConfirmedPrice}
          title={hasConfirmedPrice ? "Ajouter au panier" : "Prix à confirmer en boutique"}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-brand-500/40 bg-brand-500/15 text-brand-300 transition-colors hover:bg-brand-500 hover:text-premium-black disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ShoppingCart className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>
    </article>
  );
}
