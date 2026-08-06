import { NextRequest } from "next/server";
import { z } from "zod";
import { createHash } from "crypto";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { requireStaff } from "@/lib/jwt";
import { roleAtLeast } from "@/lib/admin/roles";
import prisma from "@/lib/prisma";
import { getPushProvider } from "@/lib/notifications/push-provider";

function encToken(token: string): string {
  // Stockage opaque (hash) — pas le jeton en clair
  return createHash("sha256").update(token).digest("hex");
}

export async function GET() {
  try {
    const user = await requireStaff();
    if (!roleAtLeast(user.role, "ADMIN")) {
      return jsonResponse({ error: "Réservé admin / propriétaire" }, 403);
    }
    const devices = await prisma.notificationDevice.findMany({
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        userId: true,
        platform: true,
        deviceName: true,
        deviceModel: true,
        isActive: true,
        isPrimary: true,
        isGateway: true,
        lastSeenAt: true,
        lastNotifyAt: true,
        createdAt: true,
        // jamais pushTokenEnc
      },
    });
    const push = getPushProvider();
    return jsonResponse({
      devices,
      push: {
        configured: push.isConfigured(),
        label: push.isConfigured() ? push.name : "Notifications push non configurées",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const registerSchema = z.object({
  action: z.enum(["register", "revoke", "heartbeat"]),
  deviceId: z.string().optional(),
  platform: z.enum(["android", "ios", "web", "samsung_gateway"]).optional(),
  deviceName: z.string().max(120).optional(),
  deviceModel: z.string().max(120).optional(),
  pushToken: z.string().min(10).max(4096).optional(),
  isPrimary: z.boolean().optional(),
  isGateway: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireStaff();
    if (!roleAtLeast(user.role, "ADMIN")) {
      return jsonResponse({ error: "Réservé admin / propriétaire" }, 403);
    }
    const body = registerSchema.parse(await request.json());

    if (body.action === "revoke") {
      if (!body.deviceId) return jsonResponse({ error: "deviceId requis" }, 400);
      await prisma.notificationDevice.update({
        where: { id: body.deviceId },
        data: { isActive: false, pushTokenEnc: null },
      });
      return jsonResponse({ ok: true, revoked: body.deviceId });
    }

    if (body.action === "heartbeat") {
      if (!body.deviceId) return jsonResponse({ error: "deviceId requis" }, 400);
      await prisma.notificationDevice.update({
        where: { id: body.deviceId },
        data: { lastSeenAt: new Date() },
      });
      return jsonResponse({ ok: true });
    }

    // register
    if (!body.platform) return jsonResponse({ error: "platform requis" }, 400);
    const push = getPushProvider();
    const device = await prisma.notificationDevice.create({
      data: {
        userId: user.userId,
        platform: body.platform,
        deviceName: body.deviceName || null,
        deviceModel: body.deviceModel || null,
        pushTokenEnc: body.pushToken ? encToken(body.pushToken) : null,
        isActive: true,
        isPrimary: !!body.isPrimary,
        isGateway: !!body.isGateway,
        lastSeenAt: new Date(),
      },
    });

    return jsonResponse({
      ok: true,
      device: {
        id: device.id,
        platform: device.platform,
        deviceName: device.deviceName,
        deviceModel: device.deviceModel,
        isActive: device.isActive,
      },
      pushConfigured: push.isConfigured(),
      note: push.isConfigured()
        ? "Appareil enregistré — envoi réel selon provider"
        : "Appareil enregistré — Notifications push non configurées (aucun envoi réel)",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
