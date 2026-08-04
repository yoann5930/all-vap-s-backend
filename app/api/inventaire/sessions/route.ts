import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
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
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

/**
 * API publique employé — création de session inventaire uniquement.
 * Pas d'auth admin. Rate-limité.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = clientIp(request);
    const limit = checkRateLimit(`inventaire:session:${ip}`, 30, 15 * 60 * 1000);
    if (!limit.ok) {
      return jsonResponse(
        { error: "Trop de tentatives. Réessayez plus tard.", retryAfterSec: limit.retryAfterSec },
        429
      );
    }

    await ensureStoreStockLocations();

    const body = z
      .object({
        employeeName: z.string().min(1).max(120),
        locationCode: z.enum([HAUTMONT_STOCK_CODE, LE_QUESNOY_STOCK_CODE]),
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
        status: "OPEN",
        notes: `started_at=${new Date().toISOString()}`,
      },
      include: { location: true },
    });

    return jsonResponse({ session }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
