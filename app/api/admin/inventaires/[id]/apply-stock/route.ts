import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { applyInventorySessionStock } from "@/lib/inventory/apply-stock";
import { syncCatalogToGoogleSheets } from "@/lib/google/sheets";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import prisma from "@/lib/prisma";
import { statusLabel } from "@/lib/inventory/status";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Applique explicitement les quantités comptées au stock officiel.
 * ADMIN uniquement — confirmation obligatoire — anti double application.
 */
export async function POST(request: NextRequest, context: Ctx) {
  try {
    const user = await requireAuth("ADMIN");
    const ip = clientIp(request);
    const limit = checkRateLimit(`inventaire:apply-stock:${user.userId}`, 10, 15 * 60 * 1000);
    if (!limit.ok) {
      return jsonResponse({ error: "Trop de tentatives", retryAfterSec: limit.retryAfterSec }, 429);
    }

    const { id } = await context.params;
    const body = z
      .object({
        confirmToken: z.literal("APPLY_STOCK_CONFIRMED"),
      })
      .parse(await request.json());

    const result = await applyInventorySessionStock({
      sessionId: id,
      user,
      ip,
      confirmToken: body.confirmToken,
      source: "inventory_admin_apply",
    });

    if (result.alreadyApplied) {
      return jsonResponse(
        {
          error: "Stock déjà appliqué pour cette session",
          alreadyApplied: true,
        },
        409
      );
    }

    const session = await prisma.inventorySession.findUnique({
      where: { id },
      include: { location: true, _count: { select: { lines: true } } },
    });

    const sheets = await syncCatalogToGoogleSheets();

    return jsonResponse({
      session: session
        ? { ...session, statusLabel: statusLabel(session.status) }
        : null,
      applied: result.applied,
      skipped: result.skipped,
      changes: result.changes,
      sheets: sheets.ok
        ? { synced: true, sheets: sheets.sheets }
        : { synced: false, code: sheets.code, message: sheets.message },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "CONFIRMATION_REQUIRED") {
        return jsonResponse({ error: "Confirmation requise (confirmToken)" }, 400);
      }
      if (error.message === "INVALID_STATUS") {
        return jsonResponse(
          {
            error:
              "Statut incompatible : la session doit être SOUMISE, TERMINÉE ou VALIDÉE",
          },
          400
        );
      }
      if (error.message === "INVALID_LOCATION") {
        return jsonResponse({ error: "Emplacement session non boutique" }, 400);
      }
    }
    return handleApiError(error);
  }
}
