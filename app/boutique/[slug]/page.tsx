import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Star, ShieldCheck, Store } from "lucide-react";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { formatPrice } from "@/lib/utils";
import { catalogDisplayPrice } from "@/lib/catalog/product-view";
import { CATALOG_PRODUCT_INCLUDE, toCatalogProduct } from "@/lib/catalog/product-view";
import type { CatalogProductFull } from "@/lib/catalog/types";
import { getGlobalStockForProduct } from "@/lib/catalog/stock";
import { ProductPurchasePanel } from "@/components/products/ProductPurchasePanel";
import { FavoriteButton } from "@/components/product/FavoriteButton";
import { ProductGrid } from "@/components/products/ProductGrid";
import { ProductGallery } from "@/components/product/ProductGallery";
import { ProductReviewsClient } from "@/components/product/ProductReviewsClient";
import { ProductDetailSections } from "@/components/catalog/ProductDetailSections";
import { Badge } from "@/components/ui/Badge";
import { Breadcrumb } from "@/components/seo/Breadcrumb";
import { JsonLd } from "@/components/seo/JsonLd";
import { absoluteUrl } from "@/lib/seo/config";
import { productSchema, reviewSchema } from "@/lib/seo/schema";
import { SetMainNavActive } from "@/components/layout/MainNavContext";
import { navIdFromProduct } from "@/lib/navigation/active-main-nav";
import { isPromo10mlEligible } from "@/lib/promotions/promo-10ml";

export const dynamic = "force-dynamic";

interface ProductPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ nic?: string }>;
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

function buildEliquideBreadcrumb(product: {
  name: string;
  slug: string;
  volumeMl: number | null;
  productType: string | null;
  manufacturer?: { name: string; slug: string } | null;
  brand: string | null;
  rangeRef?: { name: string; slug: string } | null;
  range: string | null;
}) {
  const items: Array<{ name: string; path: string }> = [
    { name: "Accueil", path: "/" },
    { name: "E-liquides", path: "/e-liquides" },
  ];

  const formatCode =
    product.productType && /^\d+ml$/i.test(product.productType)
      ? product.productType.toLowerCase()
      : product.volumeMl
        ? `${product.volumeMl}ml`
        : null;

  if (formatCode) {
    items.push({
      name: formatCode.replace("ml", " ml"),
      path: `/formats/${formatCode}`,
    });
  }

  const mfrName = product.manufacturer?.name || product.brand;
  const mfrSlug = product.manufacturer?.slug;
  if (mfrName && mfrSlug) {
    items.push({ name: mfrName, path: `/fabricants/${mfrSlug}` });
  } else if (mfrName) {
    items.push({ name: mfrName, path: "/e-liquides" });
  }

  const rangeName = product.rangeRef?.name || product.range;
  const rangeSlug = product.rangeRef?.slug;
  if (rangeName && rangeSlug) {
    const qs = mfrSlug ? `?fabricant=${mfrSlug}` : "";
    items.push({ name: rangeName, path: `/gammes/${rangeSlug}${qs}` });
  } else if (rangeName) {
    items.push({ name: rangeName, path: formatCode ? `/formats/${formatCode}` : "/e-liquides" });
  }

  items.push({ name: product.name, path: `/boutique/${product.slug}` });
  return { items, formatCode };
}

export default async function ProductDetailPage({ params }: ProductPageProps) {
  const { slug } = await params;

  // 1) Redirection éventuelle (ancienne fiche fusionnée)
  try {
    const anyBySlug = await prisma.product.findFirst({
      where: { slug },
      select: { importAnomaly: true },
    });
    if (anyBySlug?.importAnomaly?.startsWith("merged_into:")) {
      const m = anyBySlug.importAnomaly.match(/^merged_into:([^|]+)(?:\|nic:([\d.]+))?/);
      if (m?.[1]) {
        const target = m[2] ? `/boutique/${m[1]}?nic=${m[2]}` : `/boutique/${m[1]}`;
        redirect(target);
      }
    }
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    console.error("[pdp] redirect-check failed", slug, e);
  }

  // 2) Chargement produit publié — include minimal (stock chargé à part)
  const product = await prisma.product
    .findFirst({
      where: {
        slug,
        isActive: true,
        visibleOnline: true,
        catalogStatus: { in: ["valide", "actif"] },
      },
      include: {
        categoryRef: { select: { id: true, name: true, slug: true } },
        brandRef: { select: { id: true, name: true, slug: true } },
        rangeRef: {
          select: {
            id: true,
            name: true,
            slug: true,
            manufacturerId: true,
            manufacturer: { select: { id: true, slug: true } },
          },
        },
        flavors: true,
        variants: { where: { active: true } },
        catalogImages: { orderBy: { sortOrder: "asc" } },
        avaMeta: true,
        manufacturer: { select: { id: true, name: true, slug: true } },
      },
    })
    .catch((e) => {
      console.error("[pdp] product load failed", slug, e);
      return null;
    });

  if (!product) notFound();

  const { checkProductZeroMix } = await import("@/lib/catalog/zero-mix-gate");
  const zeroMix = checkProductZeroMix(product);
  if (!zeroMix.ok) {
    console.warn("[pdp] zero-mix reject", slug, zeroMix.reasons);
    notFound();
  }

  const navId = navIdFromProduct(product) || "e-liquides";

  // 3) Données satellites — erreurs isolées (ne pas planter la fiche)
  let similar: Awaited<ReturnType<typeof prisma.product.findMany>> = [];
  let reviews: Array<{
    rating: number;
    comment: string | null;
    user: { firstName: string | null };
  }> = [];
  let avgRating = 0;

  try {
    const similarRaw = await prisma.product.findMany({
      where: {
        isActive: true,
        visibleOnline: true,
        catalogStatus: { in: ["valide", "actif"] },
        id: { not: product.id },
        manufacturerId: product.manufacturerId ?? undefined,
        ...(product.rangeId ? { rangeId: product.rangeId } : {}),
      },
      include: {
        ...CATALOG_PRODUCT_INCLUDE,
        manufacturer: { select: { id: true, slug: true, name: true } },
        rangeRef: {
          select: {
            id: true,
            name: true,
            slug: true,
            manufacturerId: true,
            manufacturer: { select: { id: true, slug: true } },
          },
        },
      },
      take: 8,
      orderBy: { salesCount: "desc" },
    });
    const { filterProductsZeroMix } = await import("@/lib/catalog/zero-mix-gate");
    similar = filterProductsZeroMix(similarRaw).ok.slice(0, 4);
  } catch (e) {
    console.error("[pdp] similar products failed", slug, e);
  }

  try {
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
  } catch (e) {
    console.error("[pdp] reviews failed", slug, e);
  }

  let catalog: CatalogProductFull;
  try {
    catalog = toCatalogProduct({
      ...product,
      stockLevels: [],
    } as Parameters<typeof toCatalogProduct>[0]);
  } catch (e) {
    console.error("[pdp] toCatalogProduct failed", slug, e);
    // Ne pas planter toute la fiche : fallback minimal
    catalog = {
      id: product.id,
      reference: product.reference ?? product.sku ?? null,
      ean: product.barcode ?? null,
      slug: product.slug,
      fabricant: product.brand,
      gamme: product.rangeRef?.name ?? product.range,
      gammeSlug: product.rangeRef?.slug ?? null,
      nom: product.name,
      descriptionCourte: product.description?.slice(0, 200) ?? null,
      descriptionLongue: product.description ?? null,
      categorie: product.category,
      categorieSlug: null,
      marque: product.brand,
      marqueSlug: null,
      saveurs: [],
      saveurPrincipale: null,
      saveursSecondaires: [],
      fraicheur: null,
      intensite: null,
      format: product.productType ? product.productType.replace("ml", " ml") : null,
      nicotine: null,
      dosages: [],
      dosageLabels: [],
      pg: null,
      vg: null,
      pgVg: null,
      prix: product.priceCents,
      promo: null,
      stock: product.stock,
      stockDisponibilite: product.stock > 0 ? ("in_stock" as const) : ("out_of_stock" as const),
      photo: product.imageUrl,
      photoStatut: product.imageStatus as CatalogProductFull["photoStatut"],
      galerie: product.imageUrl ? [product.imageUrl] : [],
      visible: true,
      ordre: product.sortOrder,
      dateCreation: product.createdAt,
      dateModification: product.updatedAt,
      isNew: product.isNew,
      isPromo: product.isPromo,
      isBestSeller: product.isBestSeller,
      ava: undefined,
      profilGustatif: {
        fruit: false,
        menthole: false,
        boisson: false,
        dessert: false,
        tabac: false,
        bonbon: false,
        frais: false,
        tresFrais: false,
        sucre: false,
        acidule: false,
      },
    } satisfies CatalogProductFull;
  }

  let stockSnap;
  try {
    stockSnap = await getGlobalStockForProduct(product.id);
  } catch (e) {
    console.error("[pdp] stock failed", slug, e);
    stockSnap = {
      productId: product.id,
      variantId: null,
      quantity: product.stock,
      reservedQuantity: 0,
      availableQuantity: product.stock,
      lowStockThreshold: 3,
      source: "legacy",
      lastSyncedAt: null,
      known: true,
      status: product.stock > 0 ? ("EN_STOCK" as const) : ("RUPTURE" as const),
    };
  }

  const price = catalogDisplayPrice(catalog);
  const hasPromo = Boolean(catalog.isPromo && catalog.promo && catalog.prix > 0);
  const discountPct = hasPromo
    ? Math.round((1 - catalog.promo! / catalog.prix) * 100)
    : 0;

  const nicotineVariants = (product.variants || [])
    .filter((v) => v.active && v.nicotineMg != null)
    .map((v) => v.nicotineMg as number);
  const uniqueNicotine = [...new Set(nicotineVariants)].sort((a, b) => a - b);
  const hasMultiDosage = uniqueNicotine.length > 1;

  const stockLabel =
    stockSnap.status === "EN_STOCK"
      ? `En stock (${stockSnap.availableQuantity})`
      : stockSnap.status === "STOCK_FAIBLE"
        ? `Stock faible (${stockSnap.availableQuantity})`
        : stockSnap.status === "RUPTURE"
          ? "Rupture de stock"
          : stockSnap.availableQuantity > 0
            ? `En stock (${stockSnap.availableQuantity})`
            : "Rupture de stock";

  const isEliquide = navId === "e-liquides";
  const { items: breadcrumbItems, formatCode } = isEliquide
    ? buildEliquideBreadcrumb(product)
    : {
        items: [
          { name: "Accueil", path: "/" },
          { name: "Boutique", path: "/boutique" },
          { name: product.name, path: `/boutique/${slug}` },
        ],
        formatCode: null as string | null,
      };

  const backHref = formatCode ? `/formats/${formatCode}` : isEliquide ? "/e-liquides" : "/boutique";
  const backLabel = formatCode
    ? `Retour aux e-liquides ${formatCode.replace("ml", " ml")}`
    : isEliquide
      ? "Retour aux e-liquides"
      : "Retour à la boutique";

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
      <SetMainNavActive
        navId={navId}
        productType={product.productType}
        category={product.category}
        manufacturerSlug={product.manufacturer?.slug ?? null}
        rangeSlug={product.rangeRef?.slug ?? null}
        volumeMl={product.volumeMl}
      />
      <JsonLd data={schemaProduct} />
      <Breadcrumb items={breadcrumbItems} />

      <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-14">
        <div className="relative overflow-hidden rounded-2xl border border-white/8 bg-[#101720]">
          <ProductGallery
            name={catalog.nom}
            imageUrl={catalog.photo}
            images={catalog.galerie}
          />
          <div className="absolute left-4 top-4 flex flex-col gap-2">
            {product.isNew && <Badge>Nouveau</Badge>}
            {product.isBestSeller && <Badge variant="warning">Best-seller</Badge>}
            {hasPromo && <Badge variant="danger">-{discountPct}%</Badge>}
          </div>
        </div>

        <div>
          {(catalog.marque || catalog.gamme) && (
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#A7B0BC]">
              {[catalog.marque, catalog.gamme].filter(Boolean).join(" · ")}
            </p>
          )}
          <div className="mt-2 flex items-start justify-between gap-4">
            <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight text-[#F5F7FA] sm:text-4xl">
              {catalog.nom}
            </h1>
            <FavoriteButton productId={product.id} />
          </div>

          {catalog.reference && (
            <p className="mt-2 text-xs text-[#A7B0BC]/70">Réf. {catalog.reference}</p>
          )}

          {avgRating > 0 && (
            <div className="mt-3 flex items-center gap-1 text-amber-400">
              <Star className="h-4 w-4 fill-current" />
              <span className="text-sm font-medium">{avgRating.toFixed(1)}</span>
              <span className="text-sm text-[#A7B0BC]">({reviews.length} avis)</span>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Badge>{catalog.categorie}</Badge>
            {!hasMultiDosage && (
              <Badge variant={stockSnap.status === "RUPTURE" ? "danger" : "success"}>
                {stockLabel}
              </Badge>
            )}
            {catalog.format && <Badge>{catalog.format}</Badge>}
            {catalog.pgVg && <Badge>{catalog.pgVg}</Badge>}
            {isPromo10mlEligible({
              category: product.category,
              productType: product.productType,
              volumeMl: product.volumeMl ?? (product.productType === "10ml" ? 10 : null),
              visibleOnline: product.visibleOnline,
              isActive: product.isActive,
              catalogStatus: product.catalogStatus,
            }) && <Badge>Offre 10 ml</Badge>}
          </div>

          {!hasMultiDosage && (
            <div className="mt-6 flex items-baseline gap-3">
              {price > 0 ? (
                <>
                  <p className="font-display text-3xl font-semibold text-brand-400">
                    {formatPrice(price)}
                  </p>
                  {hasPromo && (
                    <p className="text-lg text-[#A7B0BC]/60 line-through">
                      {formatPrice(catalog.prix)}
                    </p>
                  )}
                </>
              ) : (
                <p className="font-display text-xl text-[#A7B0BC]">Prix en boutique</p>
              )}
            </div>
          )}

          {catalog.descriptionCourte && (
            <p className="mt-6 leading-relaxed text-[#A7B0BC]">{catalog.descriptionCourte}</p>
          )}

          <div className="mt-8">
            <Suspense fallback={<div className="text-sm text-[#A7B0BC]">Chargement…</div>}>
              <ProductPurchasePanel
                product={product}
                variants={product.variants || []}
                fallbackPriceCents={price}
              />
            </Suspense>
          </div>

          <ul className="mt-6 space-y-2 text-xs text-[#A7B0BC]">
            <li className="flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-brand-400" />
              Paiement sécurisé
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

          <Link href={backHref} className="mt-6 inline-block text-sm text-brand-400 hover:text-brand-300">
            ← {backLabel}
          </Link>
        </div>
      </div>

      <ProductDetailSections product={catalog} />

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
