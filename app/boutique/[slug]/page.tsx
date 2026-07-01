import { notFound } from "next/navigation";
import { Star } from "lucide-react";
import prisma from "@/lib/prisma";
import { formatPrice } from "@/lib/utils";
import { getEffectivePrice } from "@/lib/products/queries";
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

  const description = product.description || `${product.name} — All Vap's, spécialiste vape à Hautmont et Le Quesnoy.`;
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
  let reviews: Array<{ rating: number; comment: string | null; user: { firstName: string | null } }> = [];
  let avgRating = 0;

  try {
    product = await prisma.product.findFirst({
      where: { slug, isActive: true },
      include: { categoryRef: true, brandRef: true },
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

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        <div className="relative">
          <ProductGallery name={product.name} imageUrl={product.imageUrl} images={product.images} />
          <div className="absolute left-4 top-4 flex flex-col gap-2">
            {product.isNew && <Badge className="bg-blue-600 text-white">Nouveau</Badge>}
            {product.isBestSeller && <Badge className="bg-amber-600 text-white">Best-seller</Badge>}
            {hasPromo && <Badge variant="danger">-{discountPct}%</Badge>}
          </div>
        </div>

        <div>
          {product.brand && (
            <p className="text-sm font-medium uppercase tracking-wide text-gray-500">{product.brand}</p>
          )}
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-3xl font-bold text-vap-black">{product.name}</h1>
            <FavoriteButton productId={product.id} />
          </div>

          {product.sku && <p className="mt-1 text-xs text-gray-400">Réf. {product.sku}</p>}

          {avgRating > 0 && (
            <div className="mt-2 flex items-center gap-1 text-amber-500">
              <Star className="h-4 w-4 fill-current" />
              <span className="text-sm font-medium">{avgRating.toFixed(1)}</span>
              <span className="text-sm text-gray-500">({reviews.length} avis)</span>
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <Badge>{product.categoryRef?.name || product.category}</Badge>
            {product.stock > 0 ? (
              <Badge variant="success">En stock ({product.stock})</Badge>
            ) : (
              <Badge variant="danger">Rupture de stock</Badge>
            )}
          </div>

          <div className="mt-6 flex items-baseline gap-3">
            <p className="text-3xl font-bold text-brand-700">{formatPrice(price)}</p>
            {hasPromo && (
              <p className="text-lg text-gray-400 line-through">{formatPrice(product.priceCents)}</p>
            )}
          </div>

          {product.description && (
            <p className="mt-6 leading-relaxed text-gray-600">{product.description}</p>
          )}

          <div className="mt-8">
            <AddToCartButton product={product} />
          </div>

          <p className="mt-4 text-xs text-gray-500">
            Paiement sécurisé Viva.com & SumUp · Livraison Mondial Relay, Colissimo ou retrait boutique
          </p>
        </div>
      </div>

      <ProductReviewsClient productId={product.id} initialReviews={reviews} avgRating={avgRating} />

      {similar.length > 0 && (
        <section className="mt-16">
          <h2 className="text-xl font-bold">Produits similaires</h2>
          <div className="mt-6">
            <ProductGrid products={similar} />
          </div>
        </section>
      )}
    </div>
  );
}
