"use client";

import Link from "next/link";
import Image from "next/image";
import { ShoppingCart } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { getEffectivePrice } from "@/lib/products/queries";
import { extractExplicitSpecs } from "@/lib/catalog/normalize";
import { resolveProductImage, isGroupPhotoUrl } from "@/lib/catalog/images";
import { Badge } from "@/components/ui/Badge";
import { addToCart } from "@/lib/cart";
import { notifyCartUpdate } from "@/components/cart/CartProvider";
import { isPromo10mlEligible } from "@/lib/promotions/promo-10ml";
import { productHref } from "@/lib/catalog/product-href";
import type { Product, ProductFlavor, ProductVariant, ProductImage } from "@prisma/client";

type ProductCardData = Product & {
  flavors?: ProductFlavor[];
  variants?: ProductVariant[];
  catalogImages?: ProductImage[];
  rangeRef?: { name: string } | null;
};

interface ProductCardProps {
  product: ProductCardData;
}

export function ProductCard({ product }: ProductCardProps) {
  const href = productHref(product.slug);
  const price = getEffectivePrice(product);
  const hasConfirmedPrice = price > 0;
  const hasPromo = Boolean(hasConfirmedPrice && product.isPromo && product.promoPriceCents);
  const dosages = [...(product.variants || [])]
    .filter((v) => v.active && v.nicotineMg != null)
    .sort((a, b) => (a.nicotineMg || 0) - (b.nicotineMg || 0));
  const multiDosage = dosages.length > 1;
  const variant = dosages[0];
  const specs = extractExplicitSpecs(`${product.name} ${product.description || ""}`);
  const nicotine = multiDosage ? null : variant?.nicotineMg ?? specs.nicotineMg;
  const capacity =
    variant?.capacityMl ??
    (product.productType ? parseFloat(product.productType) : null) ??
    specs.capacityMl;
  const { url: displayImage } = resolveProductImage({
    imageUrl: product.imageUrl && !isGroupPhotoUrl(product.imageUrl) ? product.imageUrl : null,
    imageStatus: product.imageStatus,
    catalogImages: product.catalogImages,
    legacyImages: (product.images ?? []).filter((u) => !isGroupPhotoUrl(u)),
  });
  const shortName = product.name.replace(/^Ice Cool X\s*[-–—]\s*/i, "").trim();
  const gammeLabel = product.rangeRef?.name ?? product.range;
  const showPromo10ml = isPromo10mlEligible({
    category: product.category,
    productType: product.productType,
    volumeMl: product.volumeMl ?? (product.productType === "10ml" ? 10 : null),
    promotion10mlEligible: product.promotion10mlEligible,
    visibleOnline: product.visibleOnline,
    isActive: product.isActive,
    catalogStatus: product.catalogStatus,
    stock: product.stock,
  });

  function handleAddToCart(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (multiDosage) {
      window.location.assign(href);
      return;
    }
    if (!hasConfirmedPrice) return;
    const v = dosages[0];
    addToCart({
      productId: product.id,
      variantId: v?.id,
      name: v?.nicotineLabel ? `${product.name} — ${v.nicotineLabel}` : product.name,
      slug: product.slug,
      priceCents: v?.priceCents && v.priceCents > 0 ? v.priceCents : price,
      imageUrl: displayImage,
      nicotineLabel: v?.nicotineLabel,
      barcode: v?.barcode || product.barcode,
      sumupProductId: v?.sumupProductId || product.sumupProductId,
      sumupVariantId: v?.sumupVariantId || product.sumupVariantId,
      category: product.category,
      productType: product.productType,
      volumeMl: product.volumeMl ?? (product.productType === "10ml" ? 10 : null),
      promotion10mlEligible: product.promotion10mlEligible,
    });
    notifyCartUpdate();
  }

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-white/8 bg-[#101720] transition-all duration-300 hover:border-brand-500/35 hover:shadow-[0_0_28px_rgba(0,174,239,0.12)]">
      <Link
        href={href}
        prefetch={false}
        className="block flex-1"
        onClick={(e) => {
          // Navigation pleine page : évite les 500 RSC Soft Nav (JSON.parse) en dev
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          window.location.assign(href);
        }}
      >
        <div className="relative aspect-[4/5] overflow-hidden bg-[#0B1016]">
          {displayImage ? (
            <Image
              src={displayImage}
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
            {showPromo10ml && (
                <Badge className="text-[10px]">5+1 · 10 ml</Badge>
              )}
          </div>
        </div>

        <div className="flex flex-1 flex-col px-3 pb-3 pt-3 sm:px-3.5">
          <h3 className="line-clamp-2 min-h-[2.5rem] text-[13px] font-semibold leading-snug text-[#F5F7FA] transition-colors group-hover:text-brand-400">
            {shortName}
          </h3>
          {product.brand && (
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#A7B0BC]/75">
              {[product.brand, gammeLabel].filter(Boolean).join(" · ")}
            </p>
          )}
          {multiDosage ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {dosages.map((v) => (
                <span
                  key={v.id}
                  className="rounded border border-white/10 bg-[#0B1016] px-1.5 py-0.5 text-[10px] text-[#A7B0BC]"
                >
                  {v.nicotineMg} mg
                </span>
              ))}
              {capacity != null && (
                <span className="text-[11px] text-[#A7B0BC]">· {capacity} ml</span>
              )}
            </div>
          ) : (
            <p className="mt-1 text-[11px] text-[#A7B0BC]">
              {nicotine != null ? `${nicotine} mg/ml` : "0 mg/ml"}
              {capacity != null ? ` · ${capacity} ml` : ""}
            </p>
          )}
        </div>
      </Link>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-white/6 px-3 py-2.5 sm:px-3.5">
        <div className="min-w-0">
          {hasConfirmedPrice ? (
            <span className="font-display text-[15px] font-semibold text-white">
              {multiDosage ? `dès ${formatPrice(price)}` : formatPrice(price)}
            </span>
          ) : (
            <span className="text-[12px] font-medium text-[#A7B0BC]">Prix en boutique</span>
          )}
        </div>
        <button
          type="button"
          onClick={handleAddToCart}
          disabled={!hasConfirmedPrice && !multiDosage}
          title={
            multiDosage
              ? "Choisir un dosage"
              : hasConfirmedPrice
                ? "Ajouter au panier"
                : "Prix à confirmer en boutique"
          }
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-brand-500/40 bg-brand-500/15 text-brand-300 transition-colors hover:bg-brand-500 hover:text-premium-black disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ShoppingCart className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>
    </article>
  );
}
