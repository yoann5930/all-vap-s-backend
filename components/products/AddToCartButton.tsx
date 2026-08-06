"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { addToCart } from "@/lib/cart";
import { notifyCartUpdate } from "@/components/cart/CartProvider";
import { getEffectivePrice } from "@/lib/products/queries";
import type { Product } from "@prisma/client";

interface AddToCartButtonProps {
  product: Product;
}

export function AddToCartButton({ product }: AddToCartButtonProps) {
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const price = getEffectivePrice(product);
  const hasConfirmedPrice = price > 0;

  function handleAdd() {
    if (!hasConfirmedPrice) return;
    addToCart(
      {
        productId: product.id,
        name: product.name,
        slug: product.slug,
        priceCents: price,
        imageUrl: product.imageUrl,
      },
      quantity
    );
    notifyCartUpdate();
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  if (product.stock === 0) {
    return (
      <Button disabled className="w-full sm:w-auto" aria-disabled="true">
        Rupture de stock
      </Button>
    );
  }

  if (!hasConfirmedPrice) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#0B1016] px-4 py-3 text-sm text-[#A7B0BC]">
        Prix à confirmer en boutique — panier en ligne indisponible pour ce produit.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="flex items-center rounded-xl border border-white/10 bg-[#0B1016]">
        <button
          type="button"
          className="px-4 py-2 text-[#A7B0BC] hover:text-white"
          onClick={() => setQuantity(Math.max(1, quantity - 1))}
        >
          −
        </button>
        <span className="w-12 text-center font-medium text-[#F5F7FA]">{quantity}</span>
        <button
          type="button"
          className="px-4 py-2 text-[#A7B0BC] hover:text-white"
          onClick={() => setQuantity(Math.min(product.stock, quantity + 1))}
        >
          +
        </button>
      </div>
      <Button onClick={handleAdd} className="flex-1 sm:flex-none">
        {added ? "Ajouté ✓" : "Ajouter au panier"}
      </Button>
    </div>
  );
}
