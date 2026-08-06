import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { isStoreStockCode } from "@/lib/catalog/normalize";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { assertStoreAllowed, requireInventoryAuth } from "@/lib/inventory/auth";
import { writeAuditLog } from "@/lib/audit/log";
import { writeInventoryAudit } from "@/lib/inventory/inventory-audit";
import { isLineComplete, summarizeInventoryLines } from "@/lib/inventory/session-summary";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Envoie la session à validation responsable.
 * Ne modifie JAMAIS le stock officiel (apply-stock admin séparé).
 */
export async function POST(request: NextRequest, context: Ctx) {
  try {
    const user = await requireInventoryAuth();
    const ip = clientIp(request);
    const limit = checkRateLimit(`inventaire:complete:${user.userId}`, 20, 15 * 60 * 1000);
    if (!limit.ok) {
      return jsonResponse({ error: "Trop de clôtures", retryAfterSec: limit.retryAfterSec }, 429);
    }

    const { id } = await context.params;
    const session = await prisma.inventorySession.findUnique({
      where: { id },
      include: {
        location: true,
        lines: { include: { photos: true } },
      },
    });
    if (!session) throw new Error("NOT_FOUND");
    if (session.status !== "OPEN") {
      return jsonResponse({ error: "Session déjà clôturée" }, 400);
    }
    if (user.role !== "ADMIN" && session.createdByUserId && session.createdByUserId !== user.userId) {
      throw new Error("FORBIDDEN");
    }
    assertStoreAllowed(user, session.location.code);

    const code = session.location.code;
    if (!isStoreStockCode(code)) {
      return jsonResponse({ error: "Emplacement session non boutique" }, 400);
    }

    const summary = summarizeInventoryLines(session.lines);
    if (session.lines.length === 0) {
      return jsonResponse({ error: "Aucune ligne à clôturer" }, 400);
    }
    if (summary.missingBarcodeCount > 0 || summary.missingPriceCount > 0) {
      return jsonResponse(
        {
          error:
            "Clôture interdite : chaque ligne doit avoir un code-barres et un prix",
          missingBarcodeCount: summary.missingBarcodeCount,
          missingPriceCount: summary.missingPriceCount,
        },
        400
      );
    }

    const incomplete = session.lines.filter((l) => !isLineComplete(l));
    if (incomplete.length > 0) {
      return jsonResponse(
        {
          error: `${incomplete.length} ligne(s) incomplète(s) (code-barres / prix / nom)`,
        },
        400
      );
    }

    const now = new Date();
    const updated = await prisma.inventorySession.update({
      where: { id },
      data: {
        status: "SUBMITTED",
        completedAt: now,
        notes: [
          session.notes,
          `submitted_by=${session.employeeName}`,
          `user=${user.email}`,
          `location=${code}`,
          `lines=${session.lines.length}`,
          `stock_not_applied=1`,
          `at=${now.toISOString()}`,
        ]
          .filter(Boolean)
          .join(" | "),
      },
      include: { location: true, _count: { select: { lines: true } } },
    });

    await writeAuditLog({
      user,
      action: "INVENTORY_SESSION_SUBMITTED",
      storeCode: code,
      inventoryId: session.id,
      sessionId: session.id,
      ip,
      deviceInfo: request.headers.get("user-agent"),
      metadata: { lineCount: session.lines.length, stockApplied: false },
    });

    await writeInventoryAudit({
      user,
      inventoryId: session.id,
      action: "STATUS_CHANGED",
      fieldName: "status",
      oldValue: "OPEN",
      newValue: "SUBMITTED",
      reason: "Soumis à validation — stock officiel non modifié",
    });

    return jsonResponse({
      session: updated,
      applied: 0,
      skipped: session.lines.filter((l) => !l.productId).length,
      stockApplied: false,
      message: "Session envoyée à validation. Le stock officiel n'a pas été modifié.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
