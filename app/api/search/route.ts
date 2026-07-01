import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { jsonResponse, handleApiError } from "@/lib/api-utils";

export async function GET(request: NextRequest) {
  try {
    const q = new URL(request.url).searchParams.get("q") || "";
    if (q.length < 2) return jsonResponse([]);

    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { brand: { contains: q, mode: "insensitive" } },
          { category: { contains: q, mode: "insensitive" } },
          { sku: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        slug: true,
        priceCents: true,
        promoPriceCents: true,
        isPromo: true,
        imageUrl: true,
        category: true,
      },
      take: 8,
      orderBy: { salesCount: "desc" },
    });

    return jsonResponse(products);
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
