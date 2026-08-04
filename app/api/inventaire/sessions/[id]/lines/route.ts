import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { matchCatalogProduct } from "@/lib/catalog/matching";
import { normalizeProductName } from "@/lib/catalog/normalize";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Ctx) {
  try {
    const { id } = await context.params;
    const session = await prisma.inventorySession.findUnique({
      where: { id },
      include: {
        location: true,
        lines: { orderBy: { createdAt: "desc" }, include: { product: true } },
      },
    });
    if (!session) throw new Error("NOT_FOUND");
    return jsonResponse({ session });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest, context: Ctx) {
  try {
    const ip = clientIp(request);
    const limit = checkRateLimit(`inventaire:line:${ip}`, 120, 15 * 60 * 1000);
    if (!limit.ok) {
      return jsonResponse({ error: "Trop de requêtes", retryAfterSec: limit.retryAfterSec }, 429);
    }

    const { id } = await context.params;
    const session = await prisma.inventorySession.findUnique({
      where: { id },
      include: { location: true },
    });
    if (!session) throw new Error("NOT_FOUND");
    if (session.status !== "OPEN") {
      return jsonResponse({ error: "Session clôturée" }, 400);
    }

    const body = z
      .object({
        barcode: z.string().min(1).max(64).optional(),
        productId: z.string().optional(),
        quantityCounted: z.number().int().min(0),
        photoPath: z.string().optional(),
        notes: z.string().max(500).optional(),
      })
      .parse(await request.json());

    let productId = body.productId || null;
    let variantId: string | null = null;
    let barcode = body.barcode || null;

    if (!productId && barcode) {
      const catalog = await prisma.product.findMany({
        select: {
          id: true,
          name: true,
          normalizedName: true,
          sku: true,
          barcode: true,
          sumupProductId: true,
          brand: true,
        },
      });
      const match = matchCatalogProduct(
        {
          name: barcode,
          normalizedName: normalizeProductName(barcode),
          barcode,
        },
        catalog
      );
      if (match.productId && match.decision === "AUTO") {
        productId = match.productId;
      }
    }

    if (productId) {
      const variant = await prisma.productVariant.findFirst({
        where: { productId, active: true },
        orderBy: { createdAt: "asc" },
      });
      variantId = variant?.id || null;
      if (!barcode) {
        const product = await prisma.product.findUnique({
          where: { id: productId },
          select: { barcode: true },
        });
        barcode = product?.barcode || null;
      }
    }

    const now = new Date();
    const line = await prisma.inventoryLine.create({
      data: {
        sessionId: id,
        productId,
        variantId,
        barcode,
        quantityCounted: body.quantityCounted,
        photoPath: body.photoPath,
        notes:
          body.notes ||
          `employé=${session.employeeName}; boutique=${session.location.code}; at=${now.toISOString()}`,
      },
      include: { product: true },
    });

    return jsonResponse({
      line,
      meta: {
        employeeName: session.employeeName,
        locationCode: session.location.code,
        locationName: session.location.name,
        recordedAt: now.toISOString(),
      },
    }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
