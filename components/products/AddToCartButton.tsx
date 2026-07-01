"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { addToCart } from "@/lib/cart";
import { notifyCartUpdate } from "@/components/cart/CartProvider";
import type { Product } from "@prisma/client";

interface AddToCartButtonProps {
  product: Product;
}

export function AddToCartButton({ product }: AddToCartButtonProps) {
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  function handleAdd() {
    addToCart(
      {
        productId: product.id,
        name: product.name,
        slug: product.slug,
        priceCents: product.priceCents,
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
      <Button disabled className="w-full sm:w-auto">
        Indisponible
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="flex items-center rounded-lg border border-gray-300">
        <button
          className="px-4 py-2 text-gray-600 hover:bg-gray-50"
          onClick={() => setQuantity(Math.max(1, quantity - 1))}
        >
          −
        </button>
        <span className="w-12 text-center font-medium">{quantity}</span>
        <button
          className="px-4 py-2 text-gray-600 hover:bg-gray-50"
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
