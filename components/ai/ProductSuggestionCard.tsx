"use client";

import Image from "next/image";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { motion } from "framer-motion";
import { formatPrice } from "@/lib/utils";
import { addToCart } from "@/lib/cart";
import { notifyCartUpdate } from "@/components/cart/CartProvider";

export interface ProductSuggestion {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  priceCents: number;
  promoPriceCents: number | null;
  isPromo: boolean;
  stock: number;
  description: string | null;
  reason: string;
}

interface ProductSuggestionCardProps {
  product: ProductSuggestion;
  index: number;
}

export function ProductSuggestionCard({ product, index }: ProductSuggestionCardProps) {
  const price = product.isPromo && product.promoPriceCents ? product.promoPriceCents : product.priceCents;

  function handleAdd() {
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
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      className="overflow-hidden rounded-xl border border-cyan-500/25 bg-black/50 backdrop-blur-sm"
    >
      <div className="flex gap-3 p-2.5">
        <Link href={`/boutique/${product.slug}`} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gray-900">
          {product.imageUrl ? (
            <Image src={product.imageUrl} alt={product.name} fill className="object-cover" sizes="64px" />
          ) : (
            <div className="flex h-full items-center justify-center">
              <ShoppingBag className="h-6 w-6 text-cyan-700" />
            </div>
          )}
        </Link>

        <div className="min-w-0 flex-1">
          <Link href={`/boutique/${product.slug}`} className="line-clamp-2 text-xs font-semibold text-cyan-100 hover:text-cyan-300">
            {product.name}
          </Link>
          <p className="mt-0.5 text-[10px] text-cyan-400/60">{product.reason}</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-cyan-300">
              {product.isPromo && product.promoPriceCents && (
                <span className="mr-1 text-[10px] font-normal text-gray-500 line-through">
                  {formatPrice(product.priceCents)}
                </span>
              )}
              {formatPrice(price)}
            </span>
            <span className={`text-[10px] ${product.stock > 0 ? "text-emerald-400" : "text-red-400"}`}>
              {product.stock > 0 ? `${product.stock} en stock` : "Rupture"}
            </span>
          </div>
        </div>
      </div>

      {product.description && (
        <p className="line-clamp-2 border-t border-cyan-500/10 px-2.5 py-1.5 text-[10px] text-gray-400">
          {product.description}
        </p>
      )}

      <div className="flex border-t border-cyan-500/15">
        <Link
          href={`/boutique/${product.slug}`}
          className="flex-1 py-2 text-center text-[11px] text-cyan-400/80 transition hover:bg-cyan-500/10 hover:text-cyan-300"
        >
          Voir le produit
        </Link>
        <button
          type="button"
          onClick={handleAdd}
          disabled={product.stock <= 0}
          className="flex flex-1 items-center justify-center gap-1 border-l border-cyan-500/15 py-2 text-[11px] font-medium text-cyan-300 transition hover:bg-cyan-500/15 disabled:opacity-40"
        >
          <ShoppingBag className="h-3 w-3" />
          Ajouter
        </button>
      </div>
    </motion.div>
  );
}
