import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";

export async function GET(request: NextRequest) {
  try {
    await requireAuth("ADMIN");
    const lowStock = new URL(request.url).searchParams.get("lowStock") === "true";

    const products = await prisma.product.findMany({
      where: lowStock ? { stock: { lte: 5 }, isActive: true } : {},
      include: { categoryRef: true, brandRef: true },
      orderBy: lowStock ? { stock: "asc" } : { name: "asc" },
    });

    const stats = {
      total: products.length,
      outOfStock: products.filter((p) => p.stock === 0).length,
      lowStock: products.filter((p) => p.stock > 0 && p.stock <= 5).length,
      totalUnits: products.reduce((s, p) => s + p.stock, 0),
    };

    return jsonResponse({ products, stats });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireAuth("ADMIN");
    const { productId, stock, adjustment } = z.object({
      productId: z.string(),
      stock: z.number().int().min(0).optional(),
      adjustment: z.number().int().optional(),
    }).parse(await request.json());

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new Error("NOT_FOUND");

    const newStock = stock ?? Math.max(0, product.stock + (adjustment ?? 0));

    const updated = await prisma.product.update({
      where: { id: productId },
      data: { stock: newStock },
    });

    return jsonResponse(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
