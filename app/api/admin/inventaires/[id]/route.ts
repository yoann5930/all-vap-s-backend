import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import prisma from "@/lib/prisma";
import { summarizeInventoryLines } from "@/lib/inventory/session-summary";
import { INVENTORY_STATUSES, statusLabel } from "@/lib/inventory/status";
import { writeInventoryAudit } from "@/lib/inventory/inventory-audit";
import { writeAuditLog } from "@/lib/audit/log";
import { clientIp } from "@/lib/rate-limit";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Ctx) {
  try {
    await requireAuth("ADMIN");
    const { id } = await context.params;
    const session = await prisma.inventorySession.findUnique({
      where: { id },
      include: {
        location: true,
        createdBy: {
          select: { id: true, email: true, firstName: true, lastName: true, role: true },
        },
        lines: {
          orderBy: { scannedAt: "desc" },
          include: {
            product: {
              select: {
                id: true,
                name: true,
                brand: true,
                range: true,
                category: true,
                imageUrl: true,
                barcode: true,
                priceCents: true,
              },
            },
            photos: { orderBy: { createdAt: "desc" } },
          },
        },
        inventoryAudits: {
          orderBy: { createdAt: "desc" },
          take: 200,
        },
      },
    });
    if (!session) throw new Error("NOT_FOUND");

    const summary = summarizeInventoryLines(session.lines);
    return jsonResponse({
      inventaire: {
        ...session,
        statusLabel: statusLabel(session.status),
        summary,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, context: Ctx) {
  try {
    const user = await requireAuth("ADMIN");
    const ip = clientIp(request);
    const { id } = await context.params;
    const body = z
      .object({
        status: z.enum(INVENTORY_STATUSES).optional(),
        notes: z.string().max(1000).optional(),
        reason: z.string().max(500).optional(),
      })
      .parse(await request.json());

    const existing = await prisma.inventorySession.findUnique({ where: { id } });
    if (!existing) throw new Error("NOT_FOUND");

    const data: {
      status?: string;
      notes?: string;
      validatedAt?: Date | null;
      validatedByUserId?: string | null;
      completedAt?: Date | null;
    } = {};

    if (body.notes !== undefined) data.notes = body.notes;
    if (body.status) {
      data.status = body.status;
      if (body.status === "VALIDATED") {
        data.validatedAt = new Date();
        data.validatedByUserId = user.userId;
      }
      if (
        (body.status === "COMPLETED" || body.status === "SUBMITTED") &&
        !existing.completedAt
      ) {
        data.completedAt = new Date();
      }
      if (body.status === "CANCELLED") {
        data.completedAt = existing.completedAt || new Date();
      }
    }

    const session = await prisma.inventorySession.update({
      where: { id },
      data,
      include: { location: true },
    });

    if (body.status && body.status !== existing.status) {
      await writeInventoryAudit({
        user,
        inventoryId: id,
        action: "STATUS_CHANGED",
        fieldName: "status",
        oldValue: existing.status,
        newValue: body.status,
        reason: body.reason || null,
      });
      await writeAuditLog({
        user,
        action: "INVENTORY_STATUS_CHANGED",
        inventoryId: id,
        sessionId: id,
        storeCode: session.location.code,
        ip,
        metadata: { from: existing.status, to: body.status, reason: body.reason },
      });
    }

    return jsonResponse({
      inventaire: { ...session, statusLabel: statusLabel(session.status) },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
