import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";

const reviewSchema = z.object({
  productId: z.string(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const data = reviewSchema.parse(await request.json());

    const product = await prisma.product.findUnique({ where: { id: data.productId } });
    if (!product) throw new Error("NOT_FOUND");

    const review = await prisma.review.upsert({
      where: { productId_userId: { productId: data.productId, userId: user.userId } },
      update: { rating: data.rating, comment: data.comment || null, isApproved: false },
      create: {
        productId: data.productId,
        userId: user.userId,
        rating: data.rating,
        comment: data.comment || null,
        isApproved: false,
      },
    });

    return jsonResponse(review, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
