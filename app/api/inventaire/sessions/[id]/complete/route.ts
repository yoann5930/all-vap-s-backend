import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { isStoreStockCode } from "@/lib/catalog/normalize";
import { setStoreStockQuantity } from "@/lib/catalog/stock";
import { syncCatalogToGoogleSheets } from "@/lib/google/sheets";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { assertStoreAllowed, requireInventoryAuth } from "@/lib/inventory/auth";
import { writeAuditLog } from "@/lib/audit/log";
import { writeInventoryAudit } from "@/lib/inventory/inventory-audit";
import { isLineComplete, summarizeInventoryLines } from "@/lib/inventory/session-summary";

type Ctx = { params: Promise<{ id: string }> };

/** Clôture inventaire employé — applique uniquement sur la boutique de la session. */
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

    let applied = 0;
    let skipped = 0;

    for (const line of session.lines) {
      if (!line.productId) {
        skipped++;
        continue;
      }

      let variantId = line.variantId;
      if (!variantId) {
        const variant = await prisma.productVariant.findFirst({
          where: { productId: line.productId, active: true },
          orderBy: { createdAt: "asc" },
        });
        if (!variant) {
          const created = await prisma.productVariant.create({
            data: { productId: line.productId, name: "Standard" },
          });
          variantId = created.id;
        } else {
          variantId = variant.id;
        }
      }

      await setStoreStockQuantity({
        productId: line.productId,
        variantId,
        locationCode: code,
        quantity: line.quantityCounted,
        source: "inventory_employee",
        movementType: "SYNC_SET",
        externalReference: `inventory:${session.id}:line:${line.id}`,
      });
      applied++;

      await writeAuditLog({
        user,
        action: "INVENTORY_STOCK_APPLIED",
        storeCode: code,
        productId: line.productId,
        inventoryId: session.id,
        sessionId: session.id,
        newQuantity: line.quantityCounted,
        ip,
        metadata: { lineId: line.id },
      });
    }

    const updated = await prisma.inventorySession.update({
      where: { id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        notes: [
          session.notes,
          `completed_by=${session.employeeName}`,
          `user=${user.email}`,
          `location=${code}`,
          `applied=${applied}`,
          `at=${new Date().toISOString()}`,
        ]
          .filter(Boolean)
          .join(" | "),
      },
      include: { location: true, _count: { select: { lines: true } } },
    });

    await writeAuditLog({
      user,
      action: "INVENTORY_SESSION_COMPLETE",
      storeCode: code,
      inventoryId: session.id,
      sessionId: session.id,
      ip,
      deviceInfo: request.headers.get("user-agent"),
      metadata: { applied, skipped },
    });

    await writeInventoryAudit({
      user,
      inventoryId: session.id,
      action: "STATUS_CHANGED",
      fieldName: "status",
      oldValue: "OPEN",
      newValue: "COMPLETED",
      reason: `applied=${applied}; skipped=${skipped}`,
    });

    const sheets = await syncCatalogToGoogleSheets();

    return jsonResponse({
      session: updated,
      applied,
      skipped,
      sheets: sheets.ok
        ? { synced: true, sheets: sheets.sheets }
        : { synced: false, code: sheets.code, message: sheets.message },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
