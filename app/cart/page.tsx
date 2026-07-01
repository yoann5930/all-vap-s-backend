"use client";

import Link from "next/link";
import Image from "next/image";
import { Trash2, ShoppingBag } from "lucide-react";
import { useCart } from "@/components/cart/CartProvider";
import { updateCartQuantity, removeFromCart } from "@/lib/cart";
import { notifyCartUpdate } from "@/components/cart/CartProvider";
import { formatPrice } from "@/lib/utils";
import { getCartTotal } from "@/lib/cart";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";

export default function CartPage() {
  const { items, refreshCart } = useCart();
  const total = getCartTotal(items);

  function handleQuantityChange(productId: string, quantity: number) {
    updateCartQuantity(productId, quantity);
    refreshCart();
    notifyCartUpdate();
  }

  function handleRemove(productId: string) {
    removeFromCart(productId);
    refreshCart();
    notifyCartUpdate();
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <ShoppingBag className="mx-auto h-16 w-16 text-gray-300" />
        <h1 className="mt-4 text-2xl font-bold text-gray-900">Votre panier est vide</h1>
        <p className="mt-2 text-gray-600">Découvrez nos produits et ajoutez-les à votre panier.</p>
        <Link href="/boutique" className="mt-6 inline-block">
          <Button>Voir la boutique</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-gray-900">Panier</h1>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {items.map((item) => (
            <Card key={item.productId}>
              <CardBody className="flex items-center gap-4">
                <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                  {item.imageUrl ? (
                    <Image src={item.imageUrl} alt={item.name} fill className="object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <ShoppingBag className="h-8 w-8 text-gray-300" />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <Link href={`/boutique/${item.slug}`} className="font-medium text-gray-900 hover:text-brand-700">
                    {item.name}
                  </Link>
                  <p className="text-sm text-gray-500">{formatPrice(item.priceCents)} / unité</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center rounded-lg border border-gray-300">
                    <button
                      className="px-2 py-1 text-sm"
                      onClick={() => handleQuantityChange(item.productId, item.quantity - 1)}
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-sm">{item.quantity}</span>
                    <button
                      className="px-2 py-1 text-sm"
                      onClick={() => handleQuantityChange(item.productId, item.quantity + 1)}
                    >
                      +
                    </button>
                  </div>
                  <span className="w-20 text-right font-medium">{formatPrice(item.priceCents * item.quantity)}</span>
                  <button onClick={() => handleRemove(item.productId)} className="text-gray-400 hover:text-red-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>

        <div>
          <Card>
            <CardBody>
              <h2 className="text-lg font-semibold">Récapitulatif</h2>
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Sous-total</span>
                  <span>{formatPrice(total)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Livraison</span>
                  <span>Calculée à l&apos;étape suivante</span>
                </div>
                <div className="border-t pt-2 flex justify-between font-bold">
                  <span>Total</span>
                  <span className="text-brand-700">{formatPrice(total)}</span>
                </div>
              </div>
              <Link href="/checkout" className="mt-6 block">
                <Button className="w-full">Passer commande</Button>
              </Link>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
