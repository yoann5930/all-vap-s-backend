"use client";

import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { addToCart } from "@/lib/cart";
import { notifyCartUpdate } from "@/components/cart/CartProvider";
import { formatPrice } from "@/lib/utils";
import { isPromo10mlEligible } from "@/lib/promotions/promo-10ml";
import { isPromoTwentyEligible, twentyCartMeta } from "@/lib/promotions/promo-twenty";
import { TwentyOfferBanner } from "@/components/promotions/TwentyOfferBanner";
import { TenMlOfferBanner } from "@/components/offres/TenMlOfferBanner";
import type { Product, ProductVariant } from "@prisma/client";

type VariantRow = Pick<
  ProductVariant,
  | "id"
  | "name"
  | "nicotineMg"
  | "nicotineLabel"
  | "priceCents"
  | "stock"
  | "barcode"
  | "sumupProductId"
  | "sumupVariantId"
  | "active"
>;

interface ProductPurchasePanelProps {
  product: Product & {
    rangeRef?: { slug?: string | null; name?: string | null } | null;
  };
  variants: VariantRow[];
  /** Prix produit de secours si variante sans prix */
  fallbackPriceCents: number;
}

export function ProductPurchasePanel({
  product,
  variants,
  fallbackPriceCents,
}: ProductPurchasePanelProps) {
  const searchParams = useSearchParams();
  const nicParam = searchParams.get("nic");

  const dosages = useMemo(() => {
    return [...variants]
      .filter((v) => v.active && v.nicotineMg != null)
      .sort((a, b) => (a.nicotineMg || 0) - (b.nicotineMg || 0));
  }, [variants]);

  const initialId = useMemo(() => {
    if (nicParam != null) {
      const mg = Number(nicParam);
      const hit = dosages.find((v) => v.nicotineMg === mg);
      if (hit) return hit.id;
    }
    // Premier dosage en stock, sinon premier
    const inStock = dosages.find((v) => (v.stock ?? 0) > 0);
    return inStock?.id || dosages[0]?.id || null;
  }, [dosages, nicParam]);

  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    setSelectedId(initialId);
  }, [initialId]);

  const selected = dosages.find((v) => v.id === selectedId) || dosages[0] || null;
  const price =
    selected?.priceCents && selected.priceCents > 0
      ? selected.priceCents
      : fallbackPriceCents;
  const stock = selected?.stock ?? product.stock;
  const hasConfirmedPrice = price > 0;
  const unavailable = !selected || stock <= 0;
  const twentyMeta = twentyCartMeta(product);
  const showPromo10ml = isPromo10mlEligible({
    name: product.name,
    brand: product.brand,
    range: product.rangeRef?.name ?? product.range,
    rangeSlug: product.rangeRef?.slug ?? twentyMeta.rangeSlug,
    productFamily: product.productFamily,
    category: product.category,
    productType: product.productType,
    volumeMl: product.volumeMl ?? (product.productType === "10ml" ? 10 : null),
    promotion10mlEligible: product.promotion10mlEligible,
    visibleOnline: product.visibleOnline,
    isActive: product.isActive,
    catalogStatus: product.catalogStatus,
    availableQuantity: stock,
  });
  const showPromoTwenty = isPromoTwentyEligible({
    name: product.name,
    brand: product.brand,
    range: product.rangeRef?.name ?? product.range,
    rangeSlug: product.rangeRef?.slug ?? twentyMeta.rangeSlug,
    productFamily: product.productFamily,
    category: product.category,
    productType: product.productType,
    volumeMl: product.volumeMl ?? (product.productType === "20ml" ? 20 : null),
    visibleOnline: product.visibleOnline,
    isActive: product.isActive,
    catalogStatus: product.catalogStatus,
    availableQuantity: stock,
  });

  function handleAdd() {
    if (!selected || !hasConfirmedPrice || unavailable) return;
    const label = selected.nicotineLabel || `${selected.nicotineMg} mg`;
    addToCart(
      {
        productId: product.id,
        variantId: selected.id,
        name: `${product.name} — ${label}`,
        slug: product.slug,
        priceCents: price,
        imageUrl: product.imageUrl,
        nicotineLabel: label,
        barcode: selected.barcode,
        sumupProductId: selected.sumupProductId || product.sumupProductId,
        sumupVariantId: selected.sumupVariantId,
        category: product.category,
        productType: product.productType,
        volumeMl: product.volumeMl ?? (product.productType === "10ml" ? 10 : product.productType === "20ml" ? 20 : null),
        promotion10mlEligible: product.promotion10mlEligible,
        ...twentyMeta,
      },
      quantity
    );
    notifyCartUpdate();
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  if (dosages.length === 0) {
    // Pas de variantes nicotine — comportement simple
    const simplePrice = fallbackPriceCents;
    const simpleStock = product.stock;
    return (
      <div className="space-y-4">
        {showPromo10ml ? <TenMlOfferBanner compact className="!px-3 !py-3" /> : null}
        {showPromoTwenty ? <TwentyOfferBanner compact className="!px-3 !py-3" /> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {simpleStock <= 0 ? (
          <Button disabled className="w-full sm:w-auto" aria-disabled="true">
            Rupture de stock
          </Button>
        ) : simplePrice <= 0 ? (
          <div className="rounded-xl border border-white/10 bg-[#0B1016] px-4 py-3 text-sm text-[#A7B0BC]">
            Prix à confirmer en boutique — panier en ligne indisponible pour ce produit.
          </div>
        ) : (
          <>
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
                onClick={() => setQuantity(Math.min(simpleStock, quantity + 1))}
              >
                +
              </button>
            </div>
            <Button
              onClick={() => {
                addToCart(
                  {
                    productId: product.id,
                    name: product.name,
                    slug: product.slug,
                    priceCents: simplePrice,
                    imageUrl: product.imageUrl,
                    sumupProductId: product.sumupProductId,
                    category: product.category,
                    productType: product.productType,
                    volumeMl: product.volumeMl ?? (product.productType === "10ml" ? 10 : product.productType === "20ml" ? 20 : null),
                    promotion10mlEligible: product.promotion10mlEligible,
                    ...twentyMeta,
                  },
                  quantity
                );
                notifyCartUpdate();
                setAdded(true);
                setTimeout(() => setAdded(false), 2000);
              }}
              className="flex-1 sm:flex-none"
            >
              {added ? "Ajouté ✓" : "Ajouter au panier"}
            </Button>
          </>
        )}
      </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {showPromo10ml && <TenMlOfferBanner compact className="!px-3 !py-3" />}
      {showPromoTwenty && (
        <TwentyOfferBanner compact className="!px-3 !py-3" />
      )}
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#A7B0BC]">
          Dosages disponibles
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {dosages.map((v) => {
            const label = v.nicotineLabel || `${v.nicotineMg} mg`;
            const disabled = (v.stock ?? 0) <= 0;
            const active = v.id === selected?.id;
            return (
              <button
                key={v.id}
                type="button"
                disabled={disabled}
                onClick={() => setSelectedId(v.id)}
                className={[
                  "rounded-lg border px-3 py-1.5 text-sm transition",
                  active
                    ? "border-brand-400 bg-brand-500/20 text-white"
                    : "border-white/10 bg-[#0B1016] text-[#F5F7FA] hover:border-brand-400/50",
                  disabled ? "cursor-not-allowed opacity-40 line-through" : "",
                ].join(" ")}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-baseline gap-3">
        {hasConfirmedPrice ? (
          <p className="font-display text-3xl font-semibold text-brand-400">
            {formatPrice(price)}
          </p>
        ) : (
          <p className="font-display text-xl text-[#A7B0BC]">Prix en boutique</p>
        )}
        {selected && (
          <p className="text-sm text-[#A7B0BC]">
            {(selected.stock ?? 0) > 0
              ? "En stock"
              : "Rupture de stock"}
          </p>
        )}
      </div>

      {selected?.barcode && (
        <p className="text-xs text-[#A7B0BC]/70">EAN {selected.barcode}</p>
      )}
      {(selected?.sumupProductId || product.sumupProductId) && (
        <p className="text-[11px] text-[#A7B0BC]/50">
          Réf. {selected?.sumupProductId || product.sumupProductId}
        </p>
      )}

      {unavailable ? (
        <Button disabled className="w-full sm:w-auto" aria-disabled="true">
          Rupture de stock
        </Button>
      ) : !hasConfirmedPrice ? (
        <div className="rounded-xl border border-white/10 bg-[#0B1016] px-4 py-3 text-sm text-[#A7B0BC]">
          Prix à confirmer en boutique — panier en ligne indisponible pour ce produit.
        </div>
      ) : (
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
              onClick={() => setQuantity(Math.min(stock, quantity + 1))}
            >
              +
            </button>
          </div>
          <Button onClick={handleAdd} className="flex-1 sm:flex-none">
            {added ? "Ajouté ✓" : "Ajouter au panier"}
          </Button>
        </div>
      )}
    </div>
  );
}
