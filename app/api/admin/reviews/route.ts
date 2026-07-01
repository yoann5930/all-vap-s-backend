import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";

export async function GET() {
  try {
    await requireAuth("ADMIN");
    const reviews = await prisma.review.findMany({
      include: {
        product: { select: { name: true, slug: true } },
        user: { select: { email: true, firstName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return jsonResponse(reviews);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireAuth("ADMIN");
    const { id, isApproved } = await request.json();

    const review = await prisma.review.update({
      where: { id },
      data: { isApproved },
    });

    return jsonResponse(review);
  } catch (error) {
    return handleApiError(error);
  }
}
