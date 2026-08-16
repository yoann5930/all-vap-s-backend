/**
 * AVA détecte PREPARED (PRETE) depuis la base — jamais via un e-mail à elle-même.
 * Idempotent. Reprise après redémarrage via readyHandledAt / processUnhandledReadyOrders.
 */
import prisma from "@/lib/prisma";
import { sendOrderReadyForPickupEmail } from "@/lib/email";
import { recordAvaOrderEvent } from "@/lib/ava-order/audit-trail";
import { isAvaSelfRecipient } from "@/lib/email/ava-identity";
import { assertNoPaidShipping } from "@/lib/shipping/real-shipping-guard";
import { emitNotificationEvent } from "@/lib/notifications/bus";
import { transitionOrderStatus } from "@/lib/orders/workflow";
import {
  carrierLabel,
  fulfillmentFromDeliveryMethod,
  nextActionLabel,
  type ReadyFulfillment,
} from "@/lib/ava-order/ready-policy";

export {
  carrierLabel,
  fulfillmentFromDeliveryMethod,
  nextActionLabel,
};
export type { ReadyFulfillment };

export async function handleOrderReady(orderId: string): Promise<{
  handled: boolean;
  skipped: boolean;
  reason: string;
  fulfillment: ReadyFulfillment;
  emailedSelf: boolean;
  paidShippingAttempted: boolean;
}> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    return {
      handled: false,
      skipped: true,
      reason: "NOT_FOUND",
      fulfillment: "none",
      emailedSelf: false,
      paidShippingAttempted: false,
    };
  }

  if (order.status !== "PREPARED") {
    return {
      handled: false,
      skipped: true,
      reason: order.readyHandledAt ? "already_handled" : "not_prepared",
      fulfillment: fulfillmentFromDeliveryMethod(order.deliveryMethod),
      emailedSelf: false,
      paidShippingAttempted: false,
    };
  }

  const fulfillmentEarly = fulfillmentFromDeliveryMethod(order.deliveryMethod);
  const pickupDone = fulfillmentEarly !== "pickup" || !!order.customerReadyEmailSentAt;
  const shippingDone = fulfillmentEarly !== "shipping" || !!order.shippingWorkflowStartedAt;
  if (order.readyHandledAt && pickupDone && shippingDone) {
    return {
      handled: false,
      skipped: true,
      reason: "already_handled",
      fulfillment: fulfillmentEarly,
      emailedSelf: false,
      paidShippingAttempted: false,
    };
  }

  console.log(`[AVA] Ready order detected order=${orderId}`);
  const fulfillment = fulfillmentFromDeliveryMethod(order.deliveryMethod);
  const ref = order.id.slice(-8).toUpperCase();
  const next = nextActionLabel(order.deliveryMethod);

  await emitNotificationEvent({
    type: "order.ready",
    orderId,
    title: `Commande #${ref} prête`,
    description: `Client : ${order.customerName || order.customerEmail}. Mode : ${carrierLabel(order.deliveryMethod) || "—"}. Action suivante : ${next}.`,
    severity: "important",
    deliveryMethod: order.deliveryMethod,
    status: "PREPARED",
    isTest: order.isAudit,
  }).catch(() => null);

  if (fulfillment === "pickup") {
    console.log(`[AVA] Pickup workflow started order=${orderId}`);
    if (!order.customerReadyEmailSentAt) {
      const to = order.customerEmail.trim().toLowerCase();
      if (isAvaSelfRecipient(to)) {
        console.warn(`[AVA] Pickup email skipped — recipient is AVA mailbox order=${orderId}`);
      } else {
        await sendOrderReadyForPickupEmail({
          to,
          orderId: order.id,
          customerName: order.customerName,
          pickupStoreId: order.pickupStoreId,
        });
        await prisma.order.update({
          where: { id: orderId },
          data: { customerReadyEmailSentAt: new Date() },
        });
        await recordAvaOrderEvent(orderId, "CUSTOMER_NOTIFIED", { channel: "email", kind: "ready_pickup" });
      }
    }
    if (order.status === "PREPARED") {
      await transitionOrderStatus(orderId, "AT_RELAY", {
        actor: "ava",
        note: "RETRAIT_MAGASIN_PRET",
        metadata: { event: "CUSTOMER_NOTIFIED" },
        skipNotifications: true,
      }).catch((err) => {
        console.warn("[AVA] pickup status AT_RELAY failed", err);
      });
    }
    await prisma.order.updateMany({
      where: { id: orderId, readyHandledAt: null },
      data: { readyHandledAt: new Date() },
    });
    return {
      handled: true,
      skipped: false,
      reason: "pickup_notified",
      fulfillment,
      emailedSelf: false,
      paidShippingAttempted: false,
    };
  }

  if (fulfillment === "shipping") {
    console.log(`[AVA] Shipping workflow started order=${orderId}`);
    const paid = assertNoPaidShipping("étiquette transporteur");
    if (!order.shippingWorkflowStartedAt) {
      await prisma.order.update({
        where: { id: orderId },
        data: { shippingWorkflowStartedAt: new Date() },
      });
    }
    if (!paid.allowed || order.isAudit) {
      console.log(`[AVA] Shipping assisted only order=${orderId} reason=${paid.reason}`);
      await recordAvaOrderEvent(orderId, "SHIPMENT_CREATED", {
        mode: "assisted",
        paidShipping: false,
        reason: paid.reason,
        carrier: carrierLabel(order.deliveryMethod),
      });
      try {
        const { startCarrierShipmentForOrder } = await import("@/lib/shipping/workflow");
        await startCarrierShipmentForOrder(orderId);
      } catch (err) {
        console.warn("[AVA] shipping workflow assisted failed", err);
      }
      await prisma.order.updateMany({
        where: { id: orderId, readyHandledAt: null },
        data: { readyHandledAt: new Date() },
      });
      return {
        handled: true,
        skipped: false,
        reason: "shipping_assisted",
        fulfillment,
        emailedSelf: false,
        paidShippingAttempted: false,
      };
    }

    try {
      const { startCarrierShipmentForOrder } = await import("@/lib/shipping/workflow");
      await startCarrierShipmentForOrder(orderId);
    } catch (err) {
      console.warn("[AVA] shipping workflow failed", err);
    }
    await recordAvaOrderEvent(orderId, "SHIPMENT_CREATED", {
      paidShipping: true,
      carrier: carrierLabel(order.deliveryMethod),
    });
    await prisma.order.updateMany({
      where: { id: orderId, readyHandledAt: null },
      data: { readyHandledAt: new Date() },
    });
    return {
      handled: true,
      skipped: false,
      reason: "shipping_started",
      fulfillment,
      emailedSelf: false,
      paidShippingAttempted: true,
    };
  }

  await recordAvaOrderEvent(orderId, "ORDER_READY", { fulfillment: "none" });
  await prisma.order.updateMany({
    where: { id: orderId, readyHandledAt: null },
    data: { readyHandledAt: new Date() },
  });
  return {
    handled: true,
    skipped: false,
    reason: "ready_no_fulfillment",
    fulfillment,
    emailedSelf: false,
    paidShippingAttempted: false,
  };
}

/** Reprise après redémarrage AVA / serveur. */
export async function processUnhandledReadyOrders(limit = 25): Promise<{
  scanned: number;
  handled: number;
  skipped: number;
}> {
  const rows = await prisma.order.findMany({
    where: {
      status: "PREPARED",
      OR: [
        { readyHandledAt: null },
        { deliveryMethod: "STORE_PICKUP", customerReadyEmailSentAt: null },
        {
          deliveryMethod: { in: ["MONDIAL_RELAY", "RELAIS_COLIS", "CHRONOPOST", "COLISSIMO"] },
          shippingWorkflowStartedAt: null,
        },
      ],
    },
    orderBy: { readyAt: "asc" },
    take: limit,
    select: { id: true },
  });
  let handled = 0;
  let skipped = 0;
  for (const row of rows) {
    const result = await handleOrderReady(row.id);
    if (result.handled) handled += 1;
    else skipped += 1;
  }
  return { scanned: rows.length, handled, skipped };
}
