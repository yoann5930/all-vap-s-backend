import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import {
  HAUTMONT_STOCK_CODE,
  LE_QUESNOY_STOCK_CODE,
  isStoreStockCode,
} from "@/lib/catalog/normalize";
import {
  ensureStoreStockLocations,
  getDualStockForProduct,
  setStoreStockQuantity,
} from "@/lib/catalog/stock";

export async function GET(request: NextRequest) {
  try {
    await requireAuth("ADMIN");
    await ensureStoreStockLocations();
    const lowStock = new URL(request.url).searchParams.get("lowStock") === "true";

    const products = await prisma.product.findMany({
      where: lowStock ? { stock: { lte: 5 }, isActive: true } : {},
      include: { categoryRef: true, brandRef: true },
      orderBy: lowStock ? { stock: "asc" } : { name: "asc" },
    });

    const enriched = await Promise.all(
      products.map(async (p) => {
        const dual = await getDualStockForProduct(p.id);
        return {
          ...p,
          stockHautmont: dual.hautmont.quantity,
          stockLeQuesnoy: dual.leQuesnoy.quantity,
          stockGlobal: dual.global.quantity,
          stock: dual.global.quantity,
        };
      })
    );

    const stats = {
      total: enriched.length,
      outOfStock: enriched.filter((p) => p.stockGlobal === 0).length,
      lowStock: enriched.filter((p) => p.stockGlobal > 0 && p.stockGlobal <= 5).length,
      totalUnits: enriched.reduce((s, p) => s + p.stockGlobal, 0),
      totalHautmont: enriched.reduce((s, p) => s + p.stockHautmont, 0),
      totalLeQuesnoy: enriched.reduce((s, p) => s + p.stockLeQuesnoy, 0),
    };

    return jsonResponse({ products: enriched, stats });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireAuth("ADMIN");
    const body = z
      .object({
        productId: z.string(),
        locationCode: z.enum([HAUTMONT_STOCK_CODE, LE_QUESNOY_STOCK_CODE]),
        stock: z.number().int().min(0).optional(),
        adjustment: z.number().int().optional(),
      })
      .parse(await request.json());

    if (!isStoreStockCode(body.locationCode)) {
      return jsonResponse({ error: "locationCode invalide" }, 400);
    }

    const product = await prisma.product.findUnique({ where: { id: body.productId } });
    if (!product) throw new Error("NOT_FOUND");

    let variant = await prisma.productVariant.findFirst({
      where: { productId: body.productId, active: true },
      orderBy: { createdAt: "asc" },
    });
    if (!variant) {
      variant = await prisma.productVariant.create({
        data: { productId: body.productId, name: "Standard" },
      });
    }

    const dual = await getDualStockForProduct(body.productId);
    const current =
      body.locationCode === HAUTMONT_STOCK_CODE
        ? dual.hautmont.quantity
        : dual.leQuesnoy.quantity;
    const newStock = body.stock ?? Math.max(0, current + (body.adjustment ?? 0));

    await setStoreStockQuantity({
      productId: body.productId,
      variantId: variant.id,
      locationCode: body.locationCode,
      quantity: newStock,
      source: "admin_manual",
      movementType: "SYNC_SET",
      externalReference: `admin:${body.productId}:${body.locationCode}:${Date.now()}`,
    });

    const updatedDual = await getDualStockForProduct(body.productId);
    return jsonResponse({
      productId: body.productId,
      locationCode: body.locationCode,
      stockHautmont: updatedDual.hautmont.quantity,
      stockLeQuesnoy: updatedDual.leQuesnoy.quantity,
      stockGlobal: updatedDual.global.quantity,
      stock: updatedDual.global.quantity,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
