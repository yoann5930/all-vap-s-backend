import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { CATALOG_PRODUCT_INCLUDE, catalogDisplayPrice, toCatalogProduct } from "@/lib/catalog/product-view";
import { searchCatalogProducts } from "@/lib/catalog/search-engine";

export async function GET(request: NextRequest) {
  try {
    const q = new URL(request.url).searchParams.get("q") || "";
    if (q.length < 2) return jsonResponse([]);

    const rawProducts = await prisma.product.findMany({
      where: {
        isActive: true,
        visibleOnline: true,
        catalogStatus: { in: ["valide", "actif"] },
        manufacturerId: { not: null },
        rangeId: { not: null },
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
      take: 500,
      orderBy: { salesCount: "desc" },
    });

    const { filterProductsZeroMix } = await import("@/lib/catalog/zero-mix-gate");
    const { ok: gated } = filterProductsZeroMix(rawProducts);
    const catalog = gated.map(toCatalogProduct);
    const matched = searchCatalogProducts(catalog, q, { limit: 8 });

    const results = matched.map((p) => {
      const nicMatch = q.match(/(\d+)\s*mg/i);
      const suggestedNic = nicMatch?.[1] ?? null;
      const hasDosage =
        suggestedNic != null &&
        (p.dosages || []).some((d) => String(d) === suggestedNic);
      return {
        id: p.id,
        name: p.nom,
        slug: p.slug,
        priceCents: catalogDisplayPrice(p),
        promoPriceCents: p.promo,
        isPromo: p.isPromo,
        imageUrl: p.photo,
        category: p.categorie,
        brand: p.marque,
        gamme: p.gamme,
        saveurs: p.saveurs,
        dosages: p.dosages,
        suggestedNic: hasDosage ? suggestedNic : null,
        href:
          hasDosage && suggestedNic
            ? `/boutique/${p.slug}?nic=${suggestedNic}`
            : `/boutique/${p.slug}`,
      };
    });

    return jsonResponse(results);
  } catch (error) {
    return handleApiError(error);
  }
}

const reviewSchema = z.object({
  productId: z.string(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { requireAuth } = await import("@/lib/jwt");
    const auth = await requireAuth();
    const data = reviewSchema.parse(await request.json());

    const review = await prisma.review.upsert({
      where: { productId_userId: { productId: data.productId, userId: auth.userId } },
      update: { rating: data.rating, comment: data.comment, isApproved: false },
      create: {
        productId: data.productId,
        userId: auth.userId,
        rating: data.rating,
        comment: data.comment,
      },
    });

    return jsonResponse(review, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
