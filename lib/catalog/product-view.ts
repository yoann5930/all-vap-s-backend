import type { Prisma } from "@prisma/client";
import { extractExplicitSpecs } from "@/lib/catalog/normalize";
import { resolveProductImage, filterSingleBottleImages, isGroupPhotoUrl } from "@/lib/catalog/images";
import { getEffectivePrice } from "@/lib/products/queries";
import type { CatalogProductFull, StockAvailability } from "@/lib/catalog/types";

export const CATALOG_PRODUCT_INCLUDE = {
  categoryRef: { select: { id: true, name: true, slug: true } },
  brandRef: { select: { id: true, name: true, slug: true } },
  rangeRef: { select: { id: true, name: true, slug: true } },
  flavors: true,
  variants: { where: { active: true } },
  catalogImages: { orderBy: { sortOrder: "asc" as const } },
  avaMeta: true,
  stockLevels: {
    where: { location: { code: "GLOBAL_ALL_VAPS" } },
    select: { availableQuantity: true, quantity: true },
    take: 1,
  },
} satisfies Prisma.ProductInclude;

export type ProductWithCatalog = Prisma.ProductGetPayload<{ include: typeof CATALOG_PRODUCT_INCLUDE }>;

function stockAvailability(product: ProductWithCatalog): { stock: number; status: StockAvailability } {
  const level = product.stockLevels?.[0];
  if (level) {
    const available = level.availableQuantity ?? 0;
    if (available <= 0) return { stock: 0, status: "out_of_stock" };
    if (available <= 3) return { stock: available, status: "low_stock" };
    return { stock: available, status: "in_stock" };
  }
  if (product.stock > 0) {
    return { stock: product.stock, status: product.stock <= 3 ? "low_stock" : "in_stock" };
  }
  return { stock: 0, status: product.stock === 0 ? "out_of_stock" : "unknown" };
}

export function toCatalogProduct(product: ProductWithCatalog): CatalogProductFull {
  const flavor = product.flavors?.[0];
  const variant = product.variants?.[0];
  const specs = extractExplicitSpecs(`${product.name} ${product.description ?? ""}`);
  const { url, status, galerie } = resolveProductImage({
    imageUrl: product.imageUrl,
    imageStatus: product.imageStatus,
    catalogImages: product.catalogImages,
    legacyImages: product.images,
  });
  const cleanGalerie = filterSingleBottleImages(galerie);
  const cleanPhoto = url && !isGroupPhotoUrl(url) ? url : null;

  const saveursSecondaires = [flavor?.secondaryFlavor, flavor?.secondaryFlavor2].filter(
    (s): s is string => Boolean(s)
  );
  const saveurs = [
    ...(flavor?.flavors ?? []),
    ...(flavor?.primaryFlavor ? [flavor.primaryFlavor] : []),
    ...saveursSecondaires,
  ].filter((v, i, a) => a.indexOf(v) === i);

  const nicotine = variant?.nicotineMg ?? specs.nicotineMg ?? null;
  const dosages = [
    ...new Set(
      (product.variants || [])
        .filter((v) => v.active && v.nicotineMg != null)
        .map((v) => v.nicotineMg as number)
    ),
  ].sort((a, b) => a - b);
  const dosageLabels = (product.variants || [])
    .filter((v) => v.active && v.nicotineLabel)
    .map((v) => v.nicotineLabel as string);
  const format = variant?.capacityMl != null ? `${variant.capacityMl} ml` : specs.capacityMl != null ? `${specs.capacityMl} ml` : null;
  const pgVg = variant?.pgVgLabel ?? (variant?.pgRatio && variant?.vgRatio ? `${variant.pgRatio}/${variant.vgRatio}` : null);
  const { stock, status: stockDisponibilite } = stockAvailability(product);

  return {
    id: product.id,
    reference: product.reference ?? product.sku ?? null,
    ean: product.barcode ?? variant?.barcode ?? null,
    slug: product.slug,
    fabricant: product.brand ?? product.brandRef?.name ?? null,
    gamme: product.rangeRef?.name ?? product.range ?? null,
    gammeSlug: product.rangeRef?.slug ?? null,
    nom: product.name,
    descriptionCourte: product.shortDescription ?? product.description?.slice(0, 200) ?? null,
    descriptionLongue: product.longDescription ?? product.description ?? null,
    categorie: product.categoryRef?.name ?? product.category,
    categorieSlug: product.categoryRef?.slug ?? null,
    marque: product.brand ?? product.brandRef?.name ?? null,
    marqueSlug: product.brandRef?.slug ?? null,
    saveurs,
    saveurPrincipale: flavor?.primaryFlavor ?? null,
    saveursSecondaires: saveursSecondaires,
    fraicheur: flavor?.freshnessLevel ?? (flavor?.isFresh ? "frais" : null),
    intensite: flavor?.intensity ?? null,
    format,
    nicotine,
    dosages,
    dosageLabels,
    pg: variant?.pgRatio ?? null,
    vg: variant?.vgRatio ?? null,
    pgVg,
    prix: product.priceCents,
    promo: product.isPromo && product.promoPriceCents ? product.promoPriceCents : null,
    stock,
    stockDisponibilite,
    photo: cleanPhoto,
    photoStatut: status,
    galerie: cleanGalerie,
    visible: product.visibleOnline && product.isActive,
    ordre: product.sortOrder,
    dateCreation: product.createdAt,
    dateModification: product.updatedAt,
    isNew: product.isNew,
    isPromo: product.isPromo,
    isBestSeller: product.isBestSeller,
    ava: product.avaMeta
      ? {
          avaKeywords: product.avaMeta.avaKeywords,
          avaDescription: product.avaMeta.avaDescription,
          avaRecommendations: product.avaMeta.avaRecommendations,
          avaSaveurs: product.avaMeta.avaSaveurs,
          avaSimilaires: product.avaMeta.avaSimilaires,
          avaQuestions: product.avaMeta.avaQuestions,
        }
      : undefined,
    sumup: {
      sumupName: product.sumupName,
      sumupReference: product.sumupReference,
      sumupSku: product.sumupSku,
      sumupMapping: product.sumupMapping,
      sumupLastSync: product.sumupLastSync,
      sumupProductId: product.sumupProductId,
      sumupVariantId: product.sumupVariantId,
    },
    profilGustatif: {
      fruit: Boolean(flavor?.isFruity),
      menthole: Boolean(flavor?.isMint),
      boisson: Boolean(flavor?.isDrink),
      dessert: Boolean(flavor?.isGourmet),
      tabac: Boolean(flavor?.isTobacco),
      bonbon: Boolean(flavor?.isCandy),
      frais: flavor?.freshnessLevel === "frais" || Boolean(flavor?.isFresh),
      tresFrais: flavor?.freshnessLevel === "tres_frais",
      sucre: Boolean(flavor?.isSweet),
      acidule: Boolean(flavor?.isSour),
    },
  };
}

export function catalogDisplayPrice(product: CatalogProductFull): number {
  return getEffectivePrice({
    priceCents: product.prix,
    promoPriceCents: product.promo,
    isPromo: product.isPromo,
  });
}

/** Expose catalogue public — sans champs A.V.A. ni SumUp */
export type PublicCatalogProduct = Omit<CatalogProductFull, "ava" | "sumup">;

export function toPublicCatalogProduct(product: CatalogProductFull): PublicCatalogProduct {
  const { ava: _ava, sumup: _sumup, ...publicFields } = product;
  return publicFields;
}

export function catalogSearchBlob(product: CatalogProductFull): string {
  const parts = [
    product.nom,
    product.descriptionCourte,
    product.descriptionLongue,
    product.fabricant,
    product.marque,
    product.gamme,
    product.categorie,
    product.reference,
    product.ean,
    product.saveurPrincipale,
    ...product.saveurs,
    ...product.saveursSecondaires,
    ...(product.dosages || []).map((d) => `${d} mg`),
    ...(product.dosages || []).map((d) => `${d}mg`),
    ...(product.dosageLabels || []),
    product.ava?.avaKeywords,
    product.ava?.avaSaveurs,
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}
