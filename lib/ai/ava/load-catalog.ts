import prisma from "@/lib/prisma";
import type { AvaCatalogProduct, AvaVariantInfo } from "./types";
import { AVA_SEARCH_CONFIG } from "./config";

/**
 * Charge le catalogue réel pour A.V.A. (produits actifs + saveurs + variantes + stock SumUp).
 * Aucun secret / coût / marge.
 */
export async function loadCatalogForAva(): Promise<AvaCatalogProduct[]> {
  const rows = await prisma.product.findMany({
    where: {
      isActive: true,
      visibleOnline: true,
      NOT: { catalogStatus: { in: AVA_SEARCH_CONFIG.excludedCatalogStatuses } },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      shortDescription: true,
      category: true,
      brand: true,
      range: true,
      productType: true,
      priceCents: true,
      promoPriceCents: true,
      isPromo: true,
      isNew: true,
      isBestSeller: true,
      stock: true,
      imageUrl: true,
      isActive: true,
      visibleOnline: true,
      catalogStatus: true,
      volumeMl: true,
      manufacturer: { select: { name: true } },
      avaMeta: {
        select: {
          avaKeywords: true,
          avaSaveurs: true,
          avaDescription: true,
        },
      },
      flavors: {
        take: 1,
        orderBy: { updatedAt: "desc" },
        select: {
          primaryFlavor: true,
          secondaryFlavor: true,
          flavorFamily: true,
          flavors: true,
          searchKeywords: true,
          isFresh: true,
          isFruity: true,
          isGourmet: true,
          isTobacco: true,
          isMint: true,
          isDrink: true,
          validatedManually: true,
          confidenceScore: true,
        },
      },
      variants: {
        where: { active: true },
        select: {
          id: true,
          name: true,
          nicotineMg: true,
          nicotineLabel: true,
          capacityMl: true,
          stock: true,
          priceCents: true,
          active: true,
          pgVgLabel: true,
        },
      },
    },
  });

  const location = await prisma.stockLocation.findUnique({
    where: { code: "GLOBAL_ALL_VAPS" },
  });
  const levels = location
    ? await prisma.stockLevel.findMany({
        where: { locationId: location.id },
        select: {
          productId: true,
          variantId: true,
          availableQuantity: true,
        },
      })
    : [];

  const productLevel = new Map<string, number>();
  const variantLevel = new Map<string, number>();
  for (const l of levels) {
    variantLevel.set(l.variantId, l.availableQuantity);
    productLevel.set(
      l.productId,
      (productLevel.get(l.productId) ?? 0) + l.availableQuantity
    );
  }

  return rows.map((p) => {
    const flavor = p.flavors[0];
    const hasProductLevel = productLevel.has(p.id);
    const productAvail = hasProductLevel
      ? (productLevel.get(p.id) as number)
      : p.stock;

    const variants: AvaVariantInfo[] = p.variants.map((v) => {
      const hasV = variantLevel.has(v.id);
      const stock = hasV ? (variantLevel.get(v.id) as number) : v.stock;
      return {
        id: v.id,
        name: v.name,
        nicotineMg: v.nicotineMg,
        nicotineLabel: v.nicotineLabel,
        capacityMl: v.capacityMl,
        stock,
        priceCents: v.priceCents,
        active: v.active,
        pgVgLabel: v.pgVgLabel,
      };
    });

    const variantStockSum = variants.reduce((s, v) => s + Math.max(0, v.stock), 0);
    const availableQuantity =
      hasProductLevel
        ? productAvail
        : variants.length > 0
          ? Math.max(productAvail, variantStockSum)
          : productAvail;

    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      shortDescription: p.shortDescription,
      category: p.category,
      brand: p.brand,
      manufacturerName: p.manufacturer?.name ?? null,
      range: p.range,
      productType: p.productType,
      priceCents: p.priceCents,
      promoPriceCents: p.promoPriceCents,
      isPromo: p.isPromo,
      isNew: p.isNew,
      isBestSeller: p.isBestSeller,
      stock: availableQuantity,
      availableQuantity,
      stockKnown: true,
      imageUrl: p.imageUrl,
      isActive: p.isActive,
      visibleOnline: p.visibleOnline,
      catalogStatus: p.catalogStatus,
      volumeMl: p.volumeMl,
      primaryFlavor: flavor?.primaryFlavor ?? null,
      secondaryFlavor: flavor?.secondaryFlavor ?? null,
      flavorFamily: flavor?.flavorFamily ?? null,
      flavors: flavor?.flavors ?? [],
      searchKeywords: flavor?.searchKeywords ?? null,
      isFresh: flavor?.isFresh ?? null,
      isFruity: flavor?.isFruity ?? null,
      isGourmet: flavor?.isGourmet ?? null,
      isTobacco: flavor?.isTobacco ?? null,
      isMint: flavor?.isMint ?? null,
      isDrink: flavor?.isDrink ?? null,
      flavorValidated: Boolean(
        flavor?.validatedManually || (flavor?.confidenceScore != null && flavor.confidenceScore >= 0.7)
      ),
      avaKeywords: p.avaMeta?.avaKeywords ?? null,
      avaSaveurs: p.avaMeta?.avaSaveurs ?? null,
      avaDescription: p.avaMeta?.avaDescription ?? null,
      variants,
    };
  });
}
