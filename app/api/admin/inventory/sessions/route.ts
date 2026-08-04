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
  getStoreLocationOrThrow,
} from "@/lib/catalog/stock";

export async function GET(request: NextRequest) {
  try {
    await requireAuth("ADMIN");
    const status = new URL(request.url).searchParams.get("status");
    const sessions = await prisma.inventorySession.findMany({
      where: status ? { status } : undefined,
      include: {
        location: true,
        lines: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            product: {
              select: {
                id: true,
                name: true,
                barcode: true,
                imageUrl: true,
                priceCents: true,
                promoPriceCents: true,
              },
            },
          },
        },
        _count: { select: { lines: true } },
      },
      orderBy: { startedAt: "desc" },
      take: 100,
    });
    return jsonResponse({ sessions });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth("ADMIN");
    await ensureStoreStockLocations();

    const body = z
      .object({
        employeeName: z.string().min(1).max(120),
        locationCode: z.enum([HAUTMONT_STOCK_CODE, LE_QUESNOY_STOCK_CODE]),
        notes: z.string().max(500).optional(),
      })
      .parse(await request.json());

    if (!isStoreStockCode(body.locationCode)) {
      return jsonResponse({ error: "Boutique invalide" }, 400);
    }

    const location = await getStoreLocationOrThrow(body.locationCode);
    const session = await prisma.inventorySession.create({
      data: {
        employeeName: body.employeeName.trim(),
        locationId: location.id,
        createdByUserId: user.userId,
        notes: body.notes,
        status: "OPEN",
      },
      include: { location: true },
    });

    return jsonResponse({ session }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
