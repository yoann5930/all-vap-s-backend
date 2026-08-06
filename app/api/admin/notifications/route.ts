import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { requireStaff } from "@/lib/jwt";
import { roleAtLeast } from "@/lib/admin/roles";
import prisma from "@/lib/prisma";
import {
  getNotificationSettings,
  getOwnerPhoneSettings,
  getReportSettings,
  maskPhone,
  setNotificationSettings,
  setOwnerPhoneSettings,
  setReportSettings,
} from "@/lib/settings/app-settings";
import { emitNotificationEvent } from "@/lib/notifications/bus";
import { getPushProvider } from "@/lib/notifications/push-provider";
import { getSmsProvider } from "@/lib/notifications/sms-provider";

export async function GET(request: NextRequest) {
  try {
    const user = await requireStaff();
    if (!roleAtLeast(user.role, "ADMIN")) {
      return jsonResponse({ error: "Réservé administrateur / propriétaire" }, 403);
    }

    const section = request.nextUrl.searchParams.get("section") || "overview";
    const [notif, phone, reports, deliveries, devices, alerts, smsOutbox] = await Promise.all([
      getNotificationSettings(),
      getOwnerPhoneSettings(),
      getReportSettings(),
      prisma.notificationDelivery.findMany({
        orderBy: { createdAt: "desc" },
        take: 40,
        include: { event: { select: { type: true, title: true, orderId: true, isTest: true } } },
      }),
      prisma.notificationDevice.findMany({ orderBy: { updatedAt: "desc" }, take: 20 }),
      prisma.adminAlert.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
      prisma.smsOutbox.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    ]);

    const push = getPushProvider();
    const sms = getSmsProvider();

    return jsonResponse({
      section,
      settings: {
        notifications: notif,
        reports,
        ownerPhone: {
          ...phone,
          displayMasked: maskPhone(phone.countryCode, phone.nationalNumber),
          validationLabel: phone.validated ? "Numéro validé" : "Numéro non validé",
          // Ne jamais renvoyer le numéro complet aux employés — ici ADMIN+ uniquement
          nationalNumber: phone.nationalNumber,
        },
      },
      providers: {
        push: {
          name: push.name,
          configured: push.isConfigured(),
          label: push.isConfigured() ? push.name : "Notifications push non configurées",
        },
        sms: {
          name: sms.name,
          configured: sms.isConfigured(),
          label: sms.isConfigured() ? sms.name : "SMS non configuré",
        },
        androidGateway: {
          enabled: process.env.ANDROID_GATEWAY_ENABLED === "true",
          deviceIdSet: !!process.env.ANDROID_GATEWAY_DEVICE_ID,
          label:
            process.env.ANDROID_GATEWAY_ENABLED === "true"
              ? "Passerelle Android déclarée (app à connecter)"
              : "Passerelle Android non configurée",
        },
      },
      history: deliveries,
      devices,
      alerts,
      smsOutbox,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const patchSchema = z.object({
  notifications: z.record(z.unknown()).optional(),
  reports: z.record(z.unknown()).optional(),
  ownerPhone: z
    .object({
      countryCode: z.string().optional(),
      nationalNumber: z.string().optional(),
      preferredChannel: z.enum(["admin", "email", "push", "sms"]).optional(),
      primaryDeviceLabel: z.string().nullable().optional(),
      gatewayDeviceLabel: z.string().nullable().optional(),
      deviceModel: z.string().nullable().optional(),
      customName: z.string().nullable().optional(),
    })
    .optional(),
  testEvent: z.boolean().optional(),
  revokeDeviceId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireStaff();
    if (!roleAtLeast(user.role, "PROPRIETAIRE") && user.role !== "ADMIN") {
      return jsonResponse({ error: "Réservé propriétaire / admin" }, 403);
    }
    const body = patchSchema.parse(await request.json());

    if (body.notifications) {
      await setNotificationSettings(body.notifications as never, user.userId);
    }
    if (body.reports) {
      await setReportSettings(body.reports as never, user.userId);
    }
    if (body.ownerPhone) {
      await setOwnerPhoneSettings(body.ownerPhone, user.userId);
    }
    if (body.revokeDeviceId) {
      await prisma.notificationDevice.update({
        where: { id: body.revokeDeviceId },
        data: { isActive: false, pushTokenEnc: null, gatewaySecretHash: null },
      });
    }
    if (body.testEvent) {
      await emitNotificationEvent({
        type: "test.event",
        title: "[MODE TEST] Événement de test",
        description: "Événement interne de test — exclu des statistiques et non délivré aux fournisseurs externes.",
        severity: "info",
        isTest: true,
      });
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
