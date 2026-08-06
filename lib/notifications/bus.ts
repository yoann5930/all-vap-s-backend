/**
 * Bus de notifications All Vap's — architecture multi-canal.
 * Aucun SMS / push n'est marqué « délivré » sans confirmation réelle du fournisseur.
 */

import prisma from "@/lib/prisma";
import {
  getNotificationSettings,
  getOwnerPhoneSettings,
  maskPhone,
} from "@/lib/settings/app-settings";
import { createAdminAlert } from "@/lib/notifications/admin-alerts";
import { enqueuePush } from "@/lib/notifications/push-provider";
import { enqueueSms } from "@/lib/notifications/sms-provider";
import { sendEmail } from "@/lib/email/service";

export type OrderEventType =
  | "order.created"
  | "order.payment_confirmed"
  | "order.payment_pending"
  | "order.cancelled"
  | "order.preparation_started"
  | "order.ready"
  | "order.shipped"
  | "order.delivered"
  | "order.delivery_issue"
  | "order.stock_issue"
  | "system.critical"
  | "report.daily"
  | "test.event";

export type NotifyChannel = "admin" | "email" | "push" | "sms" | "android_gateway";

export type EmitOrderEventInput = {
  type: OrderEventType;
  orderId?: string;
  title: string;
  description: string;
  severity?: "info" | "attention" | "important" | "critical";
  amountCents?: number;
  currency?: string;
  deliveryMethod?: string | null;
  status?: string;
  isTest?: boolean;
  environment?: "production" | "test";
};

function idempotencyKey(
  type: string,
  orderId: string | undefined,
  channel: string,
  recipient: string
): string {
  return `${type}:${orderId || "none"}:${channel}:${recipient}`;
}

export async function emitNotificationEvent(input: EmitOrderEventInput) {
  const settings = await getNotificationSettings();
  if (!settings.enabled && !input.isTest) {
    return { skipped: true, reason: "notifications_disabled" as const };
  }

  // Idempotence au niveau événement
  const eventKey = `evt:${input.type}:${input.orderId || "none"}:${input.isTest ? "test" : "prod"}:${input.status || "na"}`;
  const existingEvent = await prisma.notificationEvent.findUnique({
    where: { idempotencyKey: eventKey },
  });
  if (existingEvent) {
    return { skipped: true, reason: "duplicate_event" as const, eventId: existingEvent.id };
  }

  let event;
  try {
    event = await prisma.notificationEvent.create({
      data: {
        type: input.type,
        orderId: input.orderId,
        severity: input.severity || "info",
        title: input.title,
        description: input.description,
        isTest: !!input.isTest,
        environment: input.isTest ? "test" : input.environment || "production",
        idempotencyKey: eventKey,
        payloadJson: {
          amountCents: input.amountCents ?? null,
          currency: input.currency || "EUR",
          deliveryMethod: input.deliveryMethod ?? null,
          status: input.status ?? null,
        },
      },
    });
  } catch {
    const again = await prisma.notificationEvent.findUnique({ where: { idempotencyKey: eventKey } });
    if (again) return { skipped: true, reason: "duplicate_event" as const, eventId: again.id };
    throw new Error("NOTIFICATION_EVENT_CREATE_FAILED");
  }

  // Canal administration (toujours journalisé si activé)
  if (settings.adminChannel || input.isTest) {
    await deliverChannel({
      eventId: event.id,
      type: input.type,
      orderId: input.orderId,
      channel: "admin",
      recipient: "admin",
      title: input.title,
      description: input.description,
      severity: input.severity || "info",
      isTest: !!input.isTest,
      templateKey: input.type,
    });
  }

  const wantsOrderAlert =
    input.type.startsWith("order.") &&
    (settings.alertNewOrder || settings.alertPayment || input.severity === "critical");

  if (settings.emailChannel && (wantsOrderAlert || input.severity === "critical" || input.type === "report.daily")) {
    await deliverChannel({
      eventId: event.id,
      type: input.type,
      orderId: input.orderId,
      channel: "email",
      recipient: process.env.DAILY_REPORT_RECIPIENT || "allvaps70@gmail.com",
      title: input.title,
      description: input.description,
      severity: input.severity || "info",
      isTest: !!input.isTest,
      templateKey: input.type,
    });
  }

  if (settings.pushChannel || process.env.PUSH_ENABLED === "true") {
    await deliverChannel({
      eventId: event.id,
      type: input.type,
      orderId: input.orderId,
      channel: "push",
      recipient: "owner_devices",
      title: input.title,
      description: input.description,
      severity: input.severity || "info",
      isTest: !!input.isTest,
      templateKey: input.type,
    });
  } else {
    await recordNotConfigured(event.id, input, "push", "owner_devices");
  }

  if (settings.smsChannel || settings.androidGatewayChannel || process.env.SMS_ENABLED === "true") {
    await deliverChannel({
      eventId: event.id,
      type: input.type,
      orderId: input.orderId,
      channel: settings.androidGatewayChannel ? "android_gateway" : "sms",
      recipient: "owner_phone",
      title: input.title,
      description: input.description,
      severity: input.severity || "info",
      isTest: !!input.isTest,
      templateKey: input.type,
    });
  } else {
    await recordNotConfigured(event.id, input, "sms", "owner_phone");
  }

  return { skipped: false, eventId: event.id };
}

async function recordNotConfigured(
  eventId: string,
  input: EmitOrderEventInput,
  channel: NotifyChannel,
  recipient: string
) {
  const key = idempotencyKey(input.type, input.orderId, channel, recipient);
  try {
    await prisma.notificationDelivery.create({
      data: {
        eventId,
        channel,
        recipientMasked: recipient,
        status: "not_configured",
        provider: null,
        idempotencyKey: key,
        templateKey: input.type,
        contentPreview: `${input.title} — ${input.description}`.slice(0, 200),
      },
    });
  } catch {
    /* doublon idempotent */
  }
}

async function deliverChannel(params: {
  eventId: string;
  type: string;
  orderId?: string;
  channel: NotifyChannel;
  recipient: string;
  title: string;
  description: string;
  severity: string;
  isTest: boolean;
  templateKey: string;
}) {
  const key = idempotencyKey(params.type, params.orderId, params.channel, params.recipient);
  const existing = await prisma.notificationDelivery.findUnique({ where: { idempotencyKey: key } });
  if (existing) return existing;

  const delivery = await prisma.notificationDelivery.create({
    data: {
      eventId: params.eventId,
      channel: params.channel,
      recipientMasked: params.recipient,
      status: "pending",
      idempotencyKey: key,
      templateKey: params.templateKey,
      contentPreview: `${params.title} — ${params.description}`.slice(0, 240),
      attempts: 1,
    },
  });

  try {
    if (params.channel === "admin") {
      await createAdminAlert({
        type: params.type,
        level: params.severity,
        title: params.title,
        description: params.description,
        orderId: params.orderId,
        adminPath: params.orderId ? `/admin/orders/${params.orderId}` : "/admin/alertes",
        isTest: params.isTest,
      });
      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: { status: "sent", sentAt: new Date(), provider: "admin_alerts" },
      });
      return;
    }

    if (params.channel === "email") {
      if (params.isTest) {
        await prisma.notificationDelivery.update({
          where: { id: delivery.id },
          data: {
            status: "sent",
            sentAt: new Date(),
            provider: "test_mode_no_external",
            contentPreview: `[MODE TEST] ${delivery.contentPreview}`,
          },
        });
        return;
      }
      const result = await sendEmail({
        to: params.recipient,
        subject: params.title,
        html: `<p>${params.description}</p><p><a href="${process.env.NEXT_PUBLIC_APP_URL || ""}/admin">Ouvrir l'administration</a></p>`,
        text: `${params.description}\n\nOuvrir l'administration : ${(process.env.NEXT_PUBLIC_APP_URL || "")}/admin`,
        type: "admin_notification",
        relatedOrderId: params.orderId,
        idempotencyKey: `notif-email:${key}`,
      });
      const ok = result.transport === "smtp" || result.transport === "resend";
      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: ok
            ? "sent"
            : result.transport === "console" || result.transport === "disabled"
              ? "not_configured"
              : result.transport === "skipped_duplicate"
                ? "sent"
                : "failed",
          sentAt: ok || result.transport === "skipped_duplicate" ? new Date() : null,
          provider: result.transport || "email",
          lastError: ok
            ? null
            : result.transport === "console"
              ? "CONSOLE_ONLY_NOT_DELIVERED"
              : "email_not_delivered",
          recipientMasked: params.recipient.replace(/(.{2}).+(@.+)/, "$1***$2"),
        },
      });
      return;
    }

    if (params.channel === "push") {
      const push = await enqueuePush({
        title: params.title,
        body: params.description,
        deepLink: params.orderId ? `/admin/orders/${params.orderId}` : "/admin",
        isTest: params.isTest,
      });
      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: push.status,
          provider: push.provider,
          lastError: push.reason || null,
          // Jamais "delivered" sans ack FCM
        },
      });
      return;
    }

    if (params.channel === "sms" || params.channel === "android_gateway") {
      const phone = await getOwnerPhoneSettings();
      const masked = maskPhone(phone.countryCode, phone.nationalNumber);
      const sms = await enqueueSms({
        body: `${params.title}. ${params.description}`.slice(0, 320),
        orderId: params.orderId,
        eventId: params.eventId,
        isTest: params.isTest,
        channel: params.channel,
      });
      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: sms.status,
          provider: sms.provider,
          lastError: sms.reason || null,
          recipientMasked: masked,
        },
      });
    }
  } catch (err) {
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "failed",
        lastError: err instanceof Error ? err.message : "unknown",
        attempts: { increment: 1 },
      },
    });
  }
}

/** Événement commande — payload minimal, sans PII. */
export async function emitOrderLifecycleEvent(params: {
  type: OrderEventType;
  orderId: string;
  status: string;
  totalCents: number;
  deliveryMethod?: string | null;
  isTest?: boolean;
}) {
  const templates: Partial<Record<OrderEventType, { title: string; description: string; severity: EmitOrderEventInput["severity"] }>> = {
    "order.payment_confirmed": {
      title: "All Vap's — Nouvelle commande",
      description: `Commande ${params.orderId} — ${(params.totalCents / 100).toFixed(2)} € — Paiement confirmé${params.deliveryMethod ? ` — ${params.deliveryMethod}` : ""}`,
      severity: "important",
    },
    "order.payment_pending": {
      title: "Paiement à vérifier",
      description: `La commande ${params.orderId} nécessite une vérification.`,
      severity: "attention",
    },
    "order.cancelled": {
      title: "Commande annulée",
      description: `La commande ${params.orderId} a été annulée.`,
      severity: "attention",
    },
    "order.shipped": {
      title: "Commande expédiée",
      description: `La commande ${params.orderId} a été expédiée.`,
      severity: "info",
    },
    "order.stock_issue": {
      title: "Commande bloquée",
      description: `La commande ${params.orderId} est bloquée par un problème de stock.`,
      severity: "important",
    },
  };

  const t = templates[params.type] || {
    title: params.type,
    description: `Commande ${params.orderId} — statut ${params.status}`,
    severity: "info" as const,
  };

  return emitNotificationEvent({
    type: params.type,
    orderId: params.orderId,
    title: t.title,
    description: t.description,
    severity: t.severity,
    amountCents: params.totalCents,
    deliveryMethod: params.deliveryMethod,
    status: params.status,
    isTest: params.isTest,
  });
}
