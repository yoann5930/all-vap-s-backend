import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import prisma from "@/lib/prisma";
import { summarizeInventoryLines } from "@/lib/inventory/session-summary";
import { statusLabel } from "@/lib/inventory/status";

/** Liste admin de tous les inventaires avec agrégats. */
export async function GET(request: NextRequest) {
  try {
    await requireAuth("ADMIN");
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || undefined;
    const store = url.searchParams.get("store") || undefined;
    const q = url.searchParams.get("q")?.trim() || undefined;

    const sessions = await prisma.inventorySession.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(store ? { location: { code: store } } : {}),
        ...(q
          ? {
              OR: [
                { id: { contains: q } },
                { employeeName: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        location: true,
        createdBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        lines: {
          include: { photos: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });

    const inventaires = sessions.map((s) => {
      const summary = summarizeInventoryLines(s.lines);
      return {
        id: s.id,
        employeeName: s.employeeName,
        createdBy: s.createdBy,
        storeCode: s.location.code,
        storeName: s.location.name,
        createdAt: s.createdAt,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        validatedAt: s.validatedAt,
        status: s.status,
        statusLabel: statusLabel(s.status),
        productCount: summary.referenceCount,
        totalQuantity: summary.totalQuantity,
        photoCount: summary.photoCount,
        totalValueCents: summary.totalValueCents,
        missingPriceCount: summary.missingPriceCount,
        unknownProductCount: summary.unknownProductCount,
        updatedAt: s.updatedAt,
        notes: s.notes,
      };
    });

    return jsonResponse({ inventaires });
  } catch (error) {
    return handleApiError(error);
  }
}
