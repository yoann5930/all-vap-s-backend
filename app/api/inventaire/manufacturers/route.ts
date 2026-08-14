import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { requireInventoryAuth } from "@/lib/inventory/auth";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

/**
 * GET /api/inventaire/manufacturers
 * Fabricants actifs du site (liste officielle, rien d’inventé).
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireInventoryAuth();
    const ip = clientIp(request);
    const limit = checkRateLimit(
      `inventaire:manufacturers:${user.userId}:${ip}`,
      60,
      15 * 60 * 1000
    );
    if (!limit.ok) {
      return jsonResponse(
        { error: "Trop de requêtes", retryAfterSec: limit.retryAfterSec },
        429
      );
    }

    const manufacturers = await prisma.manufacturer.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true },
    });

    return jsonResponse({ manufacturers });
  } catch (error) {
    return handleApiError(error);
  }
}
