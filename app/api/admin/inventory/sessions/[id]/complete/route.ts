import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { isStoreStockCode } from "@/lib/catalog/normalize";
import { setStoreStockQuantity } from "@/lib/catalog/stock";
import { syncCatalogToGoogleSheets } from "@/lib/google/sheets";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Clôture une session d'inventaire :
 * applique quantityCounted sur la boutique de la session uniquement,
 * recalcule le stock global (somme), tente sync Sheets si configuré.
 */
export async function POST(_request: NextRequest, context: Ctx) {
  try {
    await requireAuth("ADMIN");
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
        source: "inventory",
        movementType: "SYNC_SET",
        externalReference: `inventory:${session.id}:line:${line.id}`,
      });
      applied++;
    }

    const updated = await prisma.inventorySession.update({
      where: { id },
      data: { status: "COMPLETED", completedAt: new Date() },
      include: { location: true, _count: { select: { lines: true } } },
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
