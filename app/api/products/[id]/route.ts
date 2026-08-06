import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api-utils";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const product = await prisma.product.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      include: {
        categoryRef: true,
        brandRef: true,
        reviews: {
          where: { isApproved: true },
          include: { user: { select: { firstName: true, lastName: true } } },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!product) return errorResponse("Produit introuvable", 404);

    const similar = await prisma.product.findMany({
      where: {
        isActive: true,
        id: { not: product.id },
        OR: [
          { category: product.category },
          ...(product.categoryId ? [{ categoryId: product.categoryId }] : []),
          ...(product.brand ? [{ brand: product.brand }] : []),
        ],
      },
      take: 4,
      orderBy: { salesCount: "desc" },
    });

    const avgRating = await prisma.review.aggregate({
      where: { productId: product.id, isApproved: true },
      _avg: { rating: true },
      _count: true,
    });

    return jsonResponse({
      ...product,
      similar,
      rating: {
        average: avgRating._avg.rating ?? 0,
        count: avgRating._count,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  sku: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  category: z.string().min(2).optional(),
  brand: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  brandId: z.string().optional().nullable(),
  imageUrl: z
    .string()
    .refine((v) => /^https?:\/\//i.test(v) || v.startsWith("/"), "URL image invalide")
    .optional()
    .nullable(),
  images: z
    .array(
      z.string().refine((v) => /^https?:\/\//i.test(v) || v.startsWith("/"), "URL image invalide")
    )
    .optional(),
  priceCents: z.number().int().positive().optional(),
  promoPriceCents: z.number().int().positive().optional().nullable(),
  stock: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  isNew: z.boolean().optional(),
  isBestSeller: z.boolean().optional(),
  isPromo: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { requireAuth } = await import("@/lib/jwt");
    await requireAuth("ADMIN");
    const { id } = await params;
    const data = updateSchema.parse(await request.json());

    if (data.imageUrl) {
      const existing = await prisma.product.findUnique({
        where: { id },
        select: {
          name: true,
          brand: true,
          slug: true,
          range: true,
          productType: true,
          manufacturer: { select: { slug: true, name: true } },
          rangeRef: { select: { slug: true } },
        },
      });
      if (existing) {
        const { ensureProductImageEtastyStyle } = await import(
          "@/lib/catalog/normalize-product-image"
        );
        data.imageUrl = await ensureProductImageEtastyStyle({
          sourceUrl: data.imageUrl,
          productName: data.name || existing.name,
          brand: data.brand ?? existing.brand ?? existing.manufacturer?.name,
          manufacturerSlug: existing.manufacturer?.slug,
          rangeSlug: existing.rangeRef?.slug || existing.range,
          format: existing.productType,
          productSlug: existing.slug,
        });
      }
    }

    const product = await prisma.product.update({ where: { id }, data });
    return jsonResponse(product);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { requireAuth } = await import("@/lib/jwt");
    await requireAuth("ADMIN");
    const { id } = await params;
    await prisma.product.delete({ where: { id } });
    return jsonResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
