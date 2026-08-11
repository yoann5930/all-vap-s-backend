import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { assertStoreAllowed, requireInventoryAuth } from "@/lib/inventory/auth";
import {
  assertValidUnitPriceCents,
  computeLineTotalCents,
  parseEuroPriceInput,
} from "@/lib/inventory/pricing";
import { writeInventoryAudit } from "@/lib/inventory/inventory-audit";
import { writeAuditLog } from "@/lib/audit/log";
import { clientIp } from "@/lib/rate-limit";
import {
  INVENTORY_PLACEMENTS,
  normalizeInventoryPlacement,
  validateInventoryPlacementQuantity,
} from "@/lib/inventory/placement";

type Ctx = { params: Promise<{ id: string; lineId: string }> };

async function ensurePlacementColumn() {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "InventoryLine" ADD COLUMN IF NOT EXISTS "placement" TEXT NOT NULL DEFAULT 'STOCK'`
  );
}

/** Correction employé d'une ligne tant que la session est EN COURS. */
export async function PATCH(request: NextRequest, context: Ctx) {
  try {
    const user = await requireInventoryAuth();
    const ip = clientIp(request);
    const { id, lineId } = await context.params;

    const session = await prisma.inventorySession.findUnique({
      where: { id },
      include: { location: true },
    });
    if (!session) throw new Error("NOT_FOUND");
    if (session.status !== "OPEN") {
      return jsonResponse({ error: "Inventaire clôturé — corrections réservées à l’admin" }, 403);
    }
    if (user.role !== "ADMIN" && session.createdByUserId !== user.userId) {
      throw new Error("FORBIDDEN");
    }
    assertStoreAllowed(user, session.location.code);

    const body = z
      .object({
        quantityCounted: z.number().int().min(0).optional(),
        placement: z.enum(INVENTORY_PLACEMENTS).optional(),
        unitPrice: z.union([z.string(), z.number()]).optional(),
        unitPriceCents: z.number().int().optional(),
        notes: z.string().max(500).optional(),
        confirmZeroPrice: z.boolean().optional(),
        confirmHighAmount: z.boolean().optional(),
        reason: z.string().max(500).optional(),
      })
      .parse(await request.json());

    await ensurePlacementColumn();

    const line = await prisma.inventoryLine.findFirst({
      where: { id: lineId, sessionId: id },
    });
    if (!line) throw new Error("NOT_FOUND");

    const data: Record<string, unknown> = {};
    const audits: Array<{ field: string; old: string | number | null; next: string | number | null }> =
      [];

    const nextPlacement = body.placement
      ? normalizeInventoryPlacement(body.placement)
      : normalizeInventoryPlacement(
          (line as { placement?: string | null }).placement
        );
    const nextQty =
      body.quantityCounted != null
        ? body.quantityCounted
        : line.quantityCounted;
    const placementCheck = validateInventoryPlacementQuantity({
      placement: nextPlacement,
      quantityCounted: nextQty,
    });
    if (!placementCheck.ok) {
      return jsonResponse(
        { error: placementCheck.error, code: placementCheck.code },
        400
      );
    }

    if (body.placement != null) {
      const prev = normalizeInventoryPlacement(
        (line as { placement?: string | null }).placement
      );
      if (prev !== nextPlacement) {
        audits.push({ field: "placement", old: prev, next: nextPlacement });
        data.placement = nextPlacement;
      }
    }

    if (body.quantityCounted != null && body.quantityCounted !== line.quantityCounted) {
      audits.push({
        field: "quantityCounted",
        old: line.quantityCounted,
        next: body.quantityCounted,
      });
      data.quantityCounted = body.quantityCounted;
    }

    if (body.unitPrice != null || body.unitPriceCents != null) {
      let cents = body.unitPriceCents;
      if (cents == null) {
        const parsed = parseEuroPriceInput(body.unitPrice);
        if (!parsed.ok) return jsonResponse({ error: parsed.error }, 400);
        cents = parsed.cents;
      }
      // Employé : peut saisir un prix seulement si manquant, pas écraser catalogue
      if (
        user.role !== "ADMIN" &&
        line.unitPriceCents != null &&
        line.priceSource &&
        ["CATALOGUE", "SUMUP"].includes(line.priceSource) &&
        cents !== line.unitPriceCents
      ) {
        return jsonResponse({ error: "Prix catalogue non modifiable" }, 403);
      }
      const check = assertValidUnitPriceCents(cents, {
        allowZero: Boolean(body.confirmZeroPrice),
        confirmHighAmount: Boolean(body.confirmHighAmount),
      });
      if (!check.ok) return jsonResponse({ error: check.error }, 400);
      if (cents !== line.unitPriceCents) {
        audits.push({ field: "unitPriceCents", old: line.unitPriceCents, next: cents });
        data.unitPriceCents = cents;
        data.priceSource =
          line.unitPriceCents == null ? "SAISIE_MANUELLE" : line.priceSource || "SAISIE_MANUELLE";
      }
    }

    if (body.notes != null && body.notes !== line.notes) {
      audits.push({ field: "notes", old: line.notes, next: body.notes });
      data.notes = body.notes;
    }

    if (audits.length === 0) return jsonResponse({ error: "Aucune modification" }, 400);

    const qty = (data.quantityCounted as number | undefined) ?? line.quantityCounted;
    const price = (data.unitPriceCents as number | undefined) ?? line.unitPriceCents;
    data.totalValueCents = computeLineTotalCents(qty, price);

    const updated = await prisma.inventoryLine.update({
      where: { id: lineId },
      data,
      include: { product: true, photos: true },
    });

    for (const a of audits) {
      await writeInventoryAudit({
        user,
        inventoryId: id,
        inventoryItemId: lineId,
        action: "LINE_UPDATED",
        fieldName: a.field,
        oldValue: a.old,
        newValue: a.next,
        reason: body.reason || "correction employé",
      });
    }

    await writeAuditLog({
      user,
      action: "INVENTORY_LINE_EMPLOYEE_UPDATE",
      inventoryId: id,
      sessionId: id,
      storeCode: session.location.code,
      ip,
      metadata: { lineId, fields: audits.map((a) => a.field) },
    });

    return jsonResponse({ line: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
