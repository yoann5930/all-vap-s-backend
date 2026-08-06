"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Trash2, ShoppingBag } from "lucide-react";
import { useCart } from "@/components/cart/CartProvider";
import { updateCartQuantity, removeFromCart, getCartTotal } from "@/lib/cart";
import { notifyCartUpdate } from "@/components/cart/CartProvider";
import { formatPrice } from "@/lib/utils";
import { calculatePromo10ml, isPromo10mlEligible, type Promo10mlCartLine } from "@/lib/promotions/promo-10ml";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { isPreoptimizedProductMedia } from "@/lib/catalog/product-image-display";

type LineIssue = {
  productId: string;
  variantId: string | null;
  ok: boolean;
  available: number;
  name?: string;
};

export default function CartPage() {
  const { items, refreshCart } = useCart();
  const [stockIssues, setStockIssues] = useState<LineIssue[]>([]);
  const [stockMessage, setStockMessage] = useState<string | null>(null);
  const [stockOk, setStockOk] = useState(true);

  useEffect(() => {
    if (items.length === 0) {
      setStockIssues([]);
      setStockMessage(null);
      setStockOk(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/stock/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: items.map((i) => ({
              productId: i.productId,
              variantId: i.variantId,
              quantity: i.quantity,
              name: i.name,
            })),
          }),
        });
        const data = await res.json();
        if (cancelled) return;
        setStockOk(!!data.ok);
        setStockMessage(data.ok ? null : data.message || "Stock insuffisant");
        setStockIssues(data.lines || []);
        let changed = false;
        for (const line of data.lines || []) {
          if (!line.ok && line.available <= 0) {
            removeFromCart(line.productId, line.variantId);
            changed = true;
          } else if (!line.ok && line.available > 0 && line.available < line.requested) {
            updateCartQuantity(line.productId, line.available, line.variantId);
            changed = true;
          }
        }
        if (changed) {
          refreshCart();
          notifyCartUpdate();
        }
      } catch {
        if (!cancelled) {
          // Ne pas bloquer le tunnel sur une erreur réseau ponctuelle
          setStockOk(true);
          setStockMessage(
            "Vérification du stock momentanément indisponible — le stock sera contrôlé à la validation."
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [items, refreshCart]);

  const subtotal = getCartTotal(items);
  const promoLines: Promo10mlCartLine[] = items.map((item) => ({
    productId: item.productId,
    variantId: item.variantId,
    name: item.name,
    quantity: item.quantity,
    unitPriceCents: item.priceCents,
    category: item.category,
    productType: item.productType,
    volumeMl: item.volumeMl,
    promotion10mlEligible: item.promotion10mlEligible,
    availableQuantity: item.quantity,
  }));
  const promo = calculatePromo10ml(promoLines);
  const total = Math.max(0, subtotal - promo.discountCents);

  function handleQuantityChange(
    productId: string,
    quantity: number,
    variantId?: string | null
  ) {
    const issue = stockIssues.find(
      (l) => l.productId === productId && (l.variantId || null) === (variantId || null)
    );
    const max = issue?.available != null ? issue.available : 99;
    updateCartQuantity(productId, Math.min(Math.max(0, quantity), max), variantId);
    refreshCart();
    notifyCartUpdate();
  }

  function handleRemove(productId: string, variantId?: string | null) {
    removeFromCart(productId, variantId);
    refreshCart();
    notifyCartUpdate();
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <ShoppingBag className="mx-auto h-16 w-16 text-gray-300" />
        <h1 className="mt-4 text-2xl font-bold text-gray-900">Votre panier est vide</h1>
        <p className="mt-2 text-gray-600">Découvrez nos produits et ajoutez-les à votre panier.</p>
        <Button href="/boutique" className="mt-6">
          Voir la boutique
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-gray-900">Panier</h1>

      {stockMessage && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {stockMessage}
        </p>
      )}

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {items.map((item) => {
            const issue = stockIssues.find(
              (l) =>
                l.productId === item.productId &&
                (l.variantId || null) === (item.variantId || null)
            );
            const ruptured = issue && !issue.ok;
            return (
              <Card key={`${item.productId}::${item.variantId || ""}`}>
                <CardBody className="flex items-center gap-4">
                  <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                    {item.imageUrl ? (
                      isPreoptimizedProductMedia(item.imageUrl) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="absolute inset-0 h-full w-full object-contain p-1"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <Image
                          src={item.imageUrl}
                          alt={item.name}
                          fill
                          className="object-contain p-1"
                          sizes="80px"
                        />
                      )
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <ShoppingBag className="h-8 w-8 text-gray-300" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <Link
                      href={
                        item.nicotineLabel
                          ? `/boutique/${item.slug}?nic=${encodeURIComponent(
                              String(item.nicotineLabel).replace(/[^\d.]/g, "")
                            )}`
                          : `/boutique/${item.slug}`
                      }
                      className="font-medium text-gray-900 hover:text-brand-700"
                    >
                      {item.name}
                    </Link>
                    {item.nicotineLabel && (
                      <p className="text-xs text-gray-500">Dosage : {item.nicotineLabel}</p>
                    )}
                    {ruptured && (
                      <p className="text-xs font-medium text-red-600">Rupture de stock</p>
                    )}
                    {isPromo10mlEligible({
                      category: item.category,
                      productType: item.productType,
                      volumeMl: item.volumeMl,
                      promotion10mlEligible: item.promotion10mlEligible,
                      availableQuantity: item.quantity,
                      visibleOnline: true,
                      isActive: true,
                      catalogStatus: "valide",
                    }) && (
                      <p className="text-xs text-brand-700">Éligible offre 10 ml (5+1)</p>
                    )}
                    <p className="text-sm text-gray-500">{formatPrice(item.priceCents)} / unité</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center rounded-lg border border-gray-300">
                      <button
                        className="px-2 py-1 text-sm"
                        onClick={() =>
                          handleQuantityChange(item.productId, item.quantity - 1, item.variantId)
                        }
                      >
                        −
                      </button>
                      <span className="w-8 text-center text-sm">{item.quantity}</span>
                      <button
                        className="px-2 py-1 text-sm"
                        disabled={!!issue && item.quantity >= issue.available}
                        onClick={() =>
                          handleQuantityChange(item.productId, item.quantity + 1, item.variantId)
                        }
                      >
                        +
                      </button>
                    </div>
                    <span className="w-20 text-right font-medium">
                      {formatPrice(item.priceCents * item.quantity)}
                    </span>
                    <button
                      onClick={() => handleRemove(item.productId, item.variantId)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>

        <div>
          <Card>
            <CardBody>
              <h2 className="text-lg font-semibold">Récapitulatif</h2>
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Sous-total</span>
                  <span>{formatPrice(subtotal)}</span>
                </div>
                {promo.discountCents > 0 && (
                  <div className="flex justify-between text-sm text-brand-700">
                    <span>
                      {promo.label} ({promo.freeQuantity} offert
                      {promo.freeQuantity > 1 ? "s" : ""})
                    </span>
                    <span>-{formatPrice(promo.discountCents)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Livraison</span>
                  <span>Calculée à l&apos;étape suivante</span>
                </div>
                <div className="border-t pt-2 flex justify-between font-bold">
                  <span>Total</span>
                  <span className="text-brand-700">{formatPrice(total)}</span>
                </div>
              </div>
              {stockOk ? (
                <Button href="/checkout" className="mt-6 w-full">
                  Passer commande
                </Button>
              ) : (
                <>
                  <Button disabled className="mt-6 w-full" aria-disabled="true">
                    Quantité indisponible
                  </Button>
                  {stockMessage ? (
                    <p className="mt-2 text-center text-xs text-amber-700">{stockMessage}</p>
                  ) : null}
                </>
              )}
              {stockOk && stockMessage ? (
                <p className="mt-2 text-center text-xs text-gray-500">{stockMessage}</p>
              ) : null}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
