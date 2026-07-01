import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";

export async function GET() {
  try {
    const auth = await requireAuth();
    const favorites = await prisma.favorite.findMany({
      where: { userId: auth.userId },
      include: { product: true },
      orderBy: { createdAt: "desc" },
    });
    return jsonResponse(favorites.map((f) => f.product));
  } catch (error) {
    return handleApiError(error);
  }
}

const schema = z.object({ productId: z.string() });

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    const { productId } = schema.parse(await request.json());

    await prisma.favorite.upsert({
      where: { userId_productId: { userId: auth.userId, productId } },
      update: {},
      create: { userId: auth.userId, productId },
    });

    return jsonResponse({ success: true }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth();
    const productId = new URL(request.url).searchParams.get("productId");
    if (!productId) throw new Error("NOT_FOUND");

    await prisma.favorite.delete({
      where: { userId_productId: { userId: auth.userId, productId } },
    });

    return jsonResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
