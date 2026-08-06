import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { ensureGlobalStockLocation, computeAvailable } from "@/lib/catalog/stock";
import { maybeEmitStockAlerts } from "@/lib/stock/alerts";
import { resolveAvailability } from "@/lib/stock";
import { logStockEvent } from "@/lib/stock/events";

export async function GET(request: NextRequest) {
  try {
    await requireAuth("ADMIN");
    const lowStock = new URL(request.url).searchParams.get("lowStock") === "true";
    const statusOnly = new URL(request.url).searchParams.get("status") === "1";

    const syncState = await prisma.sumUpSyncState.findUnique({ where: { id: "default" } });
    const lastSyncRuns = await prisma.syncRun.findMany({
      where: { source: { contains: "sumup" } },
      orderBy: { startedAt: "desc" },
      take: 10,
    });
    const recentEvents = await prisma.stockEvent
      .findMany({ orderBy: { createdAt: "desc" }, take: 30 })
      .catch(() => []);

    const products = await prisma.product.findMany({
      where: lowStock
        ? { isActive: true, OR: [{ stock: { lte: 5 } }, { variants: { some: { stock: { lte: 5 } } } }] }
        : { isActive: true },
      include: {
        categoryRef: true,
        brandRef: true,
        manufacturer: true,
        variants: { where: { active: true }, orderBy: { nicotineMg: "asc" } },
        stockLevels: true,
      },
      orderBy: lowStock ? { stock: "asc" } : { name: "asc" },
      take: statusOnly ? 500 : 2000,
    });

    const outOfStock = products.filter((p) => {
      if (p.variants.length) return p.variants.every((v) => v.stock <= 0) || p.stock <= 0;
      return p.stock <= 0;
    }).length;
    const low = products.filter((p) => {
      if (p.variants.length) {
        return p.variants.some((v) => v.stock > 0 && v.stock <= 5);
      }
      return p.stock > 0 && p.stock <= 5;
    }).length;

    const stats = {
      total: products.length,
      outOfStock,
      lowStock: low,
      totalUnits: products.reduce((s, p) => s + Math.max(0, p.stock), 0),
      lastSyncAt: syncState?.lastSuccessfulSyncAt || syncState?.lastTransactionTime || null,
      lastSyncError: null as string | null,
      syncLocked: !!(syncState?.lockedUntil && syncState.lockedUntil > new Date()),
    };

    return jsonResponse({
      products,
      stats,
      syncRuns: lastSyncRuns,
      events: recentEvents,
    });
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
        variantId: z.string().optional().nullable(),
        stock: z.number().int().min(0).optional(),
        adjustment: z.number().int().optional(),
      })
      .parse(await request.json());

    const product = await prisma.product.findUnique({
      where: { id: body.productId },
      include: { variants: true },
    });
    if (!product) throw new Error("NOT_FOUND");

    const location = await ensureGlobalStockLocation();
    let variantId = body.variantId || null;
    if (!variantId && product.variants[0]) variantId = product.variants[0].id;

    if (!variantId) {
      const newStock = body.stock ?? Math.max(0, product.stock + (body.adjustment ?? 0));
      const updated = await prisma.product.update({
        where: { id: product.id },
        data: { stock: newStock },
      });
      await logStockEvent({
        type: "INCONSISTENCY",
        message: `Ajustement admin stock produit ${product.name} → ${newStock}`,
        productId: product.id,
      });
      return jsonResponse(updated);
    }

    const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) throw new Error("NOT_FOUND");

    const current =
      (await prisma.stockLevel.findFirst({
        where: { productId: product.id, variantId, locationId: location.id },
      })) || null;

    const before = current?.quantity ?? variant.stock;
    const newStock = body.stock ?? Math.max(0, before + (body.adjustment ?? 0));
    const available = computeAvailable(newStock, current?.reservedQuantity || 0);

    const level = await prisma.stockLevel.upsert({
      where: {
        variantId_locationId: { variantId, locationId: location.id },
      },
      create: {
        productId: product.id,
        variantId,
        locationId: location.id,
        quantity: newStock,
        reservedQuantity: 0,
        availableQuantity: newStock,
        lowStockThreshold: 5,
        source: "admin",
        lastSyncedAt: new Date(),
      },
      update: {
        quantity: newStock,
        availableQuantity: available,
        source: "admin",
        lastSyncedAt: new Date(),
      },
    });

    await prisma.productVariant.update({
      where: { id: variantId },
      data: { stock: newStock },
    });

    // Miroir agrégat produit = somme variantes
    const variants = await prisma.productVariant.findMany({
      where: { productId: product.id, active: true },
    });
    const aggregate = variants.reduce((s, v) => s + Math.max(0, v.stock), 0);
    await prisma.product.update({
      where: { id: product.id },
      data: { stock: aggregate, sumupLastSync: new Date() },
    });

    await prisma.stockMovement.create({
      data: {
        productId: product.id,
        variantId,
        locationId: location.id,
        movementType: "ADMIN_SET",
        quantityBefore: before,
        quantityChange: newStock - before,
        quantityAfter: newStock,
        source: "admin",
        externalReference: `admin:${product.id}:${variantId}:${Date.now()}`,
      },
    });

    const snap = await resolveAvailability(product.id, variantId);
    await maybeEmitStockAlerts(snap);
    await logStockEvent({
      type: newStock === 0 ? "RUPTURE" : newStock <= 5 ? "LOW_STOCK" : "INCONSISTENCY",
      message: `Admin stock ${product.name} → ${newStock}`,
      productId: product.id,
      variantId,
    });

    return jsonResponse({ level, stock: newStock, productStock: aggregate });
  } catch (error) {
    return handleApiError(error);
  }
}
