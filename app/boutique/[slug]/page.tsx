import { notFound } from "next/navigation";
import { Star, ShieldCheck, Store } from "lucide-react";
import prisma from "@/lib/prisma";
import { formatPrice } from "@/lib/utils";
import { getEffectivePrice } from "@/lib/products/queries";
import { extractExplicitSpecs } from "@/lib/catalog/normalize";
import { AddToCartButton } from "@/components/products/AddToCartButton";
import { FavoriteButton } from "@/components/product/FavoriteButton";
import { ProductGrid } from "@/components/products/ProductGrid";
import { ProductGallery } from "@/components/product/ProductGallery";
import { ProductReviewsClient } from "@/components/product/ProductReviewsClient";
import { Badge } from "@/components/ui/Badge";
import { Breadcrumb } from "@/components/seo/Breadcrumb";
import { JsonLd } from "@/components/seo/JsonLd";
import { absoluteUrl } from "@/lib/seo/config";
import { productSchema, reviewSchema } from "@/lib/seo/schema";

export const dynamic = "force-dynamic";

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await prisma.product.findFirst({ where: { slug } }).catch(() => null);
  if (!product) return { title: "Produit introuvable" };

  const description =
    product.description ||
    `${product.name} — All Vap's, spécialiste vape à Hautmont et Le Quesnoy.`;
  return {
    title: product.name,
    description,
    alternates: { canonical: absoluteUrl(`/boutique/${slug}`) },
    openGraph: {
      title: `${product.name} | All Vap's`,
      description,
      url: absoluteUrl(`/boutique/${slug}`),
      images: product.imageUrl ? [product.imageUrl] : [absoluteUrl("/og-image.svg")],
    },
  };
}

export default async function ProductDetailPage({ params }: ProductPageProps) {
  const { slug } = await params;

  let product;
  let similar: Awaited<ReturnType<typeof prisma.product.findMany>> = [];
  let reviews: Array<{
    rating: number;
    comment: string | null;
    user: { firstName: string | null };
  }> = [];
  let avgRating = 0;

  try {
    product = await prisma.product.findFirst({
      where: { slug, isActive: true },
      include: { categoryRef: true, brandRef: true, flavors: true, variants: true },
    });

    if (product) {
      similar = await prisma.product.findMany({
        where: {
          isActive: true,
          id: { not: product.id },
          OR: [
            { category: product.category },
            ...(product.categoryId ? [{ categoryId: product.categoryId }] : []),
          ],
        },
        take: 4,
        orderBy: { salesCount: "desc" },
      });

      reviews = await prisma.review.findMany({
        where: { productId: product.id, isApproved: true },
        include: { user: { select: { firstName: true } } },
        take: 10,
      });

      const agg = await prisma.review.aggregate({
        where: { productId: product.id, isApproved: true },
        _avg: { rating: true },
      });
      avgRating = agg._avg.rating ?? 0;
    }
  } catch {
    product = null;
  }

  if (!product) notFound();

  const price = getEffectivePrice(product);
  const hasPromo = product.isPromo && product.promoPriceCents;
  const discountPct = hasPromo
    ? Math.round((1 - product.promoPriceCents! / product.priceCents) * 100)
    : 0;

  const specs = extractExplicitSpecs(`${product.name} ${product.description || ""}`);
  const flavor = product.flavors?.[0];
  const nicotineVariants = (product.variants || [])
    .filter((v) => v.active && v.nicotineMg != null)
    .map((v) => v.nicotineMg as number);
  const uniqueNicotine = [...new Set(nicotineVariants)].sort((a, b) => a - b);

  const breadcrumbItems = [
    { name: "Accueil", path: "/" },
    { name: "Boutique", path: "/boutique" },
    { name: product.name, path: `/boutique/${slug}` },
  ];

  const schemaProduct = {
    ...productSchema({
      name: product.name,
      description: product.description,
      slug: product.slug,
      imageUrl: product.imageUrl,
      priceCents: price,
      brand: product.brand,
      sku: product.sku,
    }),
    ...(reviews.length > 0
      ? {
          aggregateRating: reviewSchema(
            reviews.map((r) => ({
              author: r.user.firstName || "Client",
              rating: r.rating,
              comment: r.comment,
            }))
          ),
        }
      : {}),
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <JsonLd data={schemaProduct} />
      <Breadcrumb items={breadcrumbItems} />

      <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-14">
        <div className="relative overflow-hidden rounded-2xl border border-white/8 bg-[#101720]">
          <ProductGallery name={product.name} imageUrl={product.imageUrl} images={product.images} />
          <div className="absolute left-4 top-4 flex flex-col gap-2">
            {product.isNew && <Badge>Nouveau</Badge>}
            {product.isBestSeller && <Badge variant="warning">Best-seller</Badge>}
            {hasPromo && <Badge variant="danger">-{discountPct}%</Badge>}
          </div>
        </div>

        <div>
          {(product.brand || product.range) && (
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#A7B0BC]">
              {[product.brand, product.range].filter(Boolean).join(" · ")}
            </p>
          )}
          <div className="mt-2 flex items-start justify-between gap-4">
            <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight text-[#F5F7FA] sm:text-4xl">
              {product.name}
            </h1>
            <FavoriteButton productId={product.id} />
          </div>

          {product.sku && (
            <p className="mt-2 text-xs text-[#A7B0BC]/70">Réf. {product.sku}</p>
          )}

          {avgRating > 0 && (
            <div className="mt-3 flex items-center gap-1 text-amber-400">
              <Star className="h-4 w-4 fill-current" />
              <span className="text-sm font-medium">{avgRating.toFixed(1)}</span>
              <span className="text-sm text-[#A7B0BC]">({reviews.length} avis)</span>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Badge>{product.categoryRef?.name || product.category}</Badge>
            {product.stock > 0 ? (
              <Badge variant="success">En stock ({product.stock})</Badge>
            ) : (
              <Badge variant="danger">Rupture de stock</Badge>
            )}
            {specs.nicotineMg != null && <Badge variant="warning">{specs.nicotineMg} mg</Badge>}
            {specs.capacityMl != null && <Badge>{specs.capacityMl} ml</Badge>}
          </div>

          <div className="mt-6 flex items-baseline gap-3">
            {price > 0 ? (
              <>
                <p className="font-display text-3xl font-semibold text-brand-400">{formatPrice(price)}</p>
                {hasPromo && (
                  <p className="text-lg text-[#A7B0BC]/60 line-through">
                    {formatPrice(product.priceCents)}
                  </p>
                )}
              </>
            ) : (
              <p className="font-display text-xl text-[#A7B0BC]">Prix en boutique</p>
            )}
          </div>

          {uniqueNicotine.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#A7B0BC]">
                Dosages disponibles
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {uniqueNicotine.map((mg) => (
                  <span
                    key={mg}
                    className="rounded-lg border border-white/10 bg-[#0B1016] px-3 py-1.5 text-sm text-[#F5F7FA]"
                  >
                    {mg} mg
                  </span>
                ))}
              </div>
            </div>
          )}

          {flavor && (flavor.flavorFamily || flavor.primaryFlavor || flavor.isFresh != null) && (
            <div className="mt-6 rounded-xl border border-white/8 bg-[#0B1016] p-4">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#A7B0BC]">
                Profil aromatique
              </p>
              <p className="mt-2 text-sm text-[#F5F7FA]">
                {[flavor.flavorFamily, flavor.primaryFlavor, flavor.secondaryFlavor]
                  .filter(Boolean)
                  .join(" · ") || "Profil en cours de complétion"}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-[#A7B0BC]">
                {flavor.isFresh && <span>Frais</span>}
                {flavor.isFruity && <span>Fruité</span>}
                {flavor.isGourmet && <span>Gourmand</span>}
                {flavor.isMint && <span>Mentholé</span>}
                {flavor.isTobacco && <span>Tabac</span>}
              </div>
            </div>
          )}

          {product.description && (
            <p className="mt-6 leading-relaxed text-[#A7B0BC]">{product.description}</p>
          )}

          <div className="mt-8">
            <AddToCartButton product={product} />
          </div>

          <ul className="mt-6 space-y-2 text-xs text-[#A7B0BC]">
            <li className="flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-brand-400" />
              Paiement sécurisé Viva.com &amp; SumUp
            </li>
            <li className="flex items-center gap-2">
              <Store className="h-3.5 w-3.5 text-brand-400" />
              Mondial Relay, Colissimo ou retrait boutique gratuit
            </li>
          </ul>

          <p className="mt-4 text-[11px] leading-relaxed text-[#A7B0BC]/70">
            Produit destiné aux adultes. Contient de la nicotine — substance addictive. Les conseils
            All Vap&apos;s ne remplacent pas un avis médical.
          </p>
        </div>
      </div>

      <ProductReviewsClient productId={product.id} initialReviews={reviews} avgRating={avgRating} />

      {similar.length > 0 && (
        <section className="mt-16">
          <p className="premium-section-label">À découvrir</p>
          <h2 className="premium-section-title mt-2">Produits proches</h2>
          <div className="mt-8">
            <ProductGrid products={similar} />
          </div>
        </section>
      )}
    </div>
  );
}
