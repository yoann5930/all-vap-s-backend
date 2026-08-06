import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { requireAdminAuth } from "@/lib/inventory/auth";
import { writeAuditLog } from "@/lib/audit/log";
import { writeInventoryAudit } from "@/lib/inventory/inventory-audit";
import { clientIp } from "@/lib/rate-limit";

/**
 * Remise à zéro des inventaires EN COURS / TERMINÉS non validés.
 * Passe les sessions en CANCELLED (pas de suppression destructive des stocks).
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAdminAuth();
    const ip = clientIp(request);
    const body = z
      .object({
        confirm: z.literal(true),
        includeCompleted: z.boolean().optional().default(true),
      })
      .parse(await request.json().catch(() => ({})));

    if (!body.confirm) {
      return jsonResponse({ error: "Confirmation requise" }, 400);
    }

    const statuses = body.includeCompleted
      ? ["OPEN", "COMPLETED"]
      : ["OPEN"];

    const sessions = await prisma.inventorySession.findMany({
      where: { status: { in: statuses } },
      select: { id: true, status: true, employeeName: true },
    });

    const now = new Date();
    let cancelled = 0;

    for (const session of sessions) {
      await prisma.inventorySession.update({
        where: { id: session.id },
        data: {
          status: "CANCELLED",
          notes: [
            `reset_by=${user.email}`,
            `previous=${session.status}`,
            `at=${now.toISOString()}`,
          ].join(" | "),
          updatedAt: now,
        },
      });

      await writeInventoryAudit({
        user,
        inventoryId: session.id,
        action: "STATUS_CHANGED",
        fieldName: "status",
        oldValue: session.status,
        newValue: "CANCELLED",
        reason: "Remise à zéro inventaires (admin)",
      });

      cancelled += 1;
    }

    await writeAuditLog({
      user,
      action: "INVENTORY_RESET",
      ip,
      deviceInfo: request.headers.get("user-agent"),
      metadata: { cancelled, statuses },
    });

    return jsonResponse({
      ok: true,
      cancelled,
      message: `${cancelled} inventaire(s) annulé(s) — vous pouvez recommencer à zéro.`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
