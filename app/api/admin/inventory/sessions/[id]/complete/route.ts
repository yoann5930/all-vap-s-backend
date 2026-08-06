import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { isStoreStockCode } from "@/lib/catalog/normalize";
import { writeInventoryAudit } from "@/lib/inventory/inventory-audit";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Clôture admin → soumission à validation.
 * Ne modifie JAMAIS le stock (utiliser apply-stock).
 */
export async function POST(_request: NextRequest, context: Ctx) {
  try {
    const user = await requireAuth("ADMIN");
    const { id } = await context.params;

    const session = await prisma.inventorySession.findUnique({
      where: { id },
      include: { location: true, lines: true },
    });
    if (!session) throw new Error("NOT_FOUND");
    if (session.status !== "OPEN") {
      return jsonResponse({ error: "Session déjà clôturée" }, 400);
    }

    const code = session.location.code;
    if (!isStoreStockCode(code)) {
      return jsonResponse({ error: "Emplacement session non boutique" }, 400);
    }

    const now = new Date();
    const updated = await prisma.inventorySession.update({
      where: { id },
      data: {
        status: "SUBMITTED",
        completedAt: now,
        notes: [
          session.notes,
          `submitted_by_admin=${user.email}`,
          `stock_not_applied=1`,
          `at=${now.toISOString()}`,
        ]
          .filter(Boolean)
          .join(" | "),
      },
      include: { location: true, _count: { select: { lines: true } } },
    });

    await writeInventoryAudit({
      user,
      inventoryId: session.id,
      action: "STATUS_CHANGED",
      fieldName: "status",
      oldValue: "OPEN",
      newValue: "SUBMITTED",
      reason: "Clôture admin sans application stock",
    });

    return jsonResponse({
      session: updated,
      applied: 0,
      skipped: session.lines.filter((l) => !l.productId).length,
      stockApplied: false,
      message: "Session soumise. Utilisez « Appliquer les corrections au stock » pour écrire le stock.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
