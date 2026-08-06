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
import {
  assertStoreAllowed,
  displayEmployeeName,
  requireInventoryAuth,
} from "@/lib/inventory/auth";
import { writeAuditLog } from "@/lib/audit/log";

/**
 * API inventaire employés — authentification EMPLOYEE/ADMIN obligatoire.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireInventoryAuth();
    const ip = clientIp(request);
    const limit = checkRateLimit(`inventaire:session:${user.userId}`, 30, 15 * 60 * 1000);
    if (!limit.ok) {
      return jsonResponse(
        { error: "Trop de tentatives. Réessayez plus tard.", retryAfterSec: limit.retryAfterSec },
        429
      );
    }

    await ensureStoreStockLocations();

    const body = z
      .object({
        locationCode: z.enum([HAUTMONT_STOCK_CODE, LE_QUESNOY_STOCK_CODE]),
      })
      .parse(await request.json());

    if (!isStoreStockCode(body.locationCode)) {
      return jsonResponse({ error: "Boutique invalide" }, 400);
    }
    assertStoreAllowed(user, body.locationCode);

    const employeeName = displayEmployeeName(user);
    const location = await getStoreLocationOrThrow(body.locationCode);
    const session = await prisma.inventorySession.create({
      data: {
        employeeName,
        locationId: location.id,
        createdByUserId: user.userId,
        status: "OPEN",
        notes: `started_at=${new Date().toISOString()}; user=${user.email}; role=${user.role}`,
      },
      include: { location: true },
    });

    await writeAuditLog({
      user,
      action: "INVENTORY_SESSION_START",
      storeCode: body.locationCode,
      inventoryId: session.id,
      sessionId: session.id,
      ip,
      deviceInfo: request.headers.get("user-agent"),
    });

    return jsonResponse({ session, user: { email: user.email, role: user.role, allowedStores: user.allowedStores } }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
