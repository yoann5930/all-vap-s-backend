import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { requireStaff } from "@/lib/jwt";
import { roleAtLeast } from "@/lib/admin/roles";
import {
  activateAuditMode,
  deactivateAuditMode,
  getAuditModeState,
  publicAuditStatus,
} from "@/lib/audit/mode";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireStaff();
    if (!roleAtLeast(user.role, "ADMIN")) {
      return jsonResponse({ error: "Réservé admin / propriétaire" }, 403);
    }
    const state = await getAuditModeState();
    const logs = await prisma.auditModeLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return jsonResponse({ audit: publicAuditStatus(state), logs });
  } catch (error) {
    return handleApiError(error);
  }
}

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("activate"),
    campaignId: z.string().min(4).max(80),
    secret: z.string().min(16).max(200),
    expiresInHours: z.number().int().min(1).max(72).default(8),
    allowOutOfStock: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("deactivate"),
    reason: z.string().max(200).optional(),
  }),
]);

export async function POST(request: NextRequest) {
  try {
    const user = await requireStaff();
    if (!roleAtLeast(user.role, "ADMIN")) {
      return jsonResponse({ error: "Réservé admin / propriétaire" }, 403);
    }
    const body = postSchema.parse(await request.json());

    if (body.action === "activate") {
      const expiresAt = new Date(Date.now() + body.expiresInHours * 3600_000);
      const state = await activateAuditMode({
        campaignId: body.campaignId,
        secret: body.secret,
        expiresAt,
        actorUserId: user.userId,
        allowOutOfStock: body.allowOutOfStock,
      });
      return jsonResponse({
        ok: true,
        audit: publicAuditStatus(state),
        message:
          "Mode AUDIT_ONLY activé. Conservez le secret hors Git. Les commandes audit sont exclues du CA.",
      });
    }

    const state = await deactivateAuditMode({
      actorUserId: user.userId,
      reason: body.reason || "manual_deactivate",
    });
    return jsonResponse({
      ok: true,
      audit: publicAuditStatus(state),
      message: "Mode AUDIT_ONLY désactivé — hors stock de nouveau refusé.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
