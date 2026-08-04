import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import prisma from "@/lib/prisma";
import {
  assertValidUnitPriceCents,
  computeLineTotalCents,
  parseEuroPriceInput,
} from "@/lib/inventory/pricing";
import { writeInventoryAudit } from "@/lib/inventory/inventory-audit";
import { writeAuditLog } from "@/lib/audit/log";
import { clientIp } from "@/lib/rate-limit";
import { PRICE_SOURCES } from "@/lib/inventory/status";

type Ctx = { params: Promise<{ id: string; lineId: string }> };

export async function PATCH(request: NextRequest, context: Ctx) {
  try {
    const user = await requireAuth("ADMIN");
    const ip = clientIp(request);
    const { id, lineId } = await context.params;

    const body = z
      .object({
        quantityCounted: z.number().int().min(0).optional(),
        unitPriceCents: z.number().int().optional(),
        unitPrice: z.union([z.string(), z.number()]).optional(),
        productId: z.string().nullable().optional(),
        barcode: z.string().max(64).nullable().optional(),
        notes: z.string().max(1000).nullable().optional(),
        productNameSnapshot: z.string().max(240).nullable().optional(),
        confirmZeroPrice: z.boolean().optional(),
        confirmHighAmount: z.boolean().optional(),
        reason: z.string().min(1).max(500),
      })
      .parse(await request.json());

    const line = await prisma.inventoryLine.findFirst({
      where: { id: lineId, sessionId: id },
      include: { session: { include: { location: true } } },
    });
    if (!line) throw new Error("NOT_FOUND");

    const data: Record<string, unknown> = {};
    const audits: Array<{
      fieldName: string;
      oldValue: string | number | null;
      newValue: string | number | null;
    }> = [];

    if (body.quantityCounted != null && body.quantityCounted !== line.quantityCounted) {
      audits.push({
        fieldName: "quantityCounted",
        oldValue: line.quantityCounted,
        newValue: body.quantityCounted,
      });
      data.quantityCounted = body.quantityCounted;
    }

    let nextPrice = line.unitPriceCents;
    if (body.unitPriceCents != null || body.unitPrice != null) {
      if (body.unitPriceCents != null) nextPrice = body.unitPriceCents;
      else {
        const parsed = parseEuroPriceInput(body.unitPrice);
        if (!parsed.ok) return jsonResponse({ error: parsed.error }, 400);
        nextPrice = parsed.cents;
      }
      const check = assertValidUnitPriceCents(nextPrice!, {
        allowZero: Boolean(body.confirmZeroPrice),
        confirmHighAmount: Boolean(body.confirmHighAmount),
      });
      if (!check.ok) return jsonResponse({ error: check.error }, 400);
      if (nextPrice !== line.unitPriceCents) {
        audits.push({
          fieldName: "unitPriceCents",
          oldValue: line.unitPriceCents,
          newValue: nextPrice,
        });
        data.unitPriceCents = nextPrice;
        data.priceSource = "CORRECTION_ADMIN";
      }
    }

    if (body.productId !== undefined && body.productId !== line.productId) {
      audits.push({
        fieldName: "productId",
        oldValue: line.productId,
        newValue: body.productId,
      });
      data.productId = body.productId;
      if (body.productId) {
        const product = await prisma.product.findUnique({ where: { id: body.productId } });
        if (product) {
          data.productNameSnapshot = product.name;
          data.brandSnapshot = product.brand;
          data.rangeSnapshot = product.range;
          data.categorySnapshot = product.category;
          data.catalogImageUrl = product.imageUrl;
          if (!body.barcode) data.barcode = product.barcode;
        }
      }
    }

    if (body.barcode !== undefined && body.barcode !== line.barcode) {
      audits.push({ fieldName: "barcode", oldValue: line.barcode, newValue: body.barcode });
      data.barcode = body.barcode;
    }
    if (body.notes !== undefined && body.notes !== line.notes) {
      audits.push({ fieldName: "notes", oldValue: line.notes, newValue: body.notes });
      data.notes = body.notes;
    }
    if (
      body.productNameSnapshot !== undefined &&
      body.productNameSnapshot !== line.productNameSnapshot
    ) {
      audits.push({
        fieldName: "productNameSnapshot",
        oldValue: line.productNameSnapshot,
        newValue: body.productNameSnapshot,
      });
      data.productNameSnapshot = body.productNameSnapshot;
    }

    const qty = (data.quantityCounted as number | undefined) ?? line.quantityCounted;
    const price =
      (data.unitPriceCents as number | undefined) ?? line.unitPriceCents ?? null;
    data.totalValueCents = computeLineTotalCents(qty, price);

    if (audits.length === 0) {
      return jsonResponse({ error: "Aucune modification" }, 400);
    }

    const updated = await prisma.inventoryLine.update({
      where: { id: lineId },
      data,
      include: { product: true, photos: true },
    });

    // Marquer la session comme corrigée si elle était terminée/validée
    if (["COMPLETED", "VALIDATED"].includes(line.session.status)) {
      await prisma.inventorySession.update({
        where: { id },
        data: { status: "CORRECTED" },
      });
      await writeInventoryAudit({
        user,
        inventoryId: id,
        action: "STATUS_CHANGED",
        fieldName: "status",
        oldValue: line.session.status,
        newValue: "CORRECTED",
        reason: body.reason,
      });
    }

    for (const a of audits) {
      await writeInventoryAudit({
        user,
        inventoryId: id,
        inventoryItemId: lineId,
        action: "LINE_UPDATED",
        fieldName: a.fieldName,
        oldValue: a.oldValue,
        newValue: a.newValue,
        reason: body.reason,
      });
    }

    await writeAuditLog({
      user,
      action: "INVENTORY_LINE_ADMIN_UPDATE",
      inventoryId: id,
      sessionId: id,
      storeCode: line.session.location.code,
      productId: updated.productId,
      productName: updated.productNameSnapshot,
      ip,
      metadata: { lineId, fields: audits.map((a) => a.fieldName), reason: body.reason },
    });

    void PRICE_SOURCES;
    return jsonResponse({ line: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
