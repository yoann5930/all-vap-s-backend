import type { OrderDocumentType, OrderStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { canTransition, orderStatusLabel } from "@/lib/orders/status";
import {
  sendOrderCancelledEmail,
  sendOrderDeliveredEmail,
  sendOrderReadyForPickupEmail,
  sendOrderShippedEmail,
  sendOrderStatusUpdateEmail,
} from "@/lib/email";
import { getTrackingUrl } from "@/lib/shipping/options";
import {
  generateAndStoreOrderDocument,
  emailOrderDocument,
} from "@/lib/documents/service";

export type TransitionOptions = {
  changedById?: string | null;
  note?: string | null;
  trackingNumber?: string | null;
  skipNotifications?: boolean;
};

/**
 * Change le statut d'une commande : historisation + effets métier + notifications.
 */
export async function transitionOrderStatus(
  orderId: string,
  toStatus: OrderStatus,
  options: TransitionOptions = {}
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          product: { select: { name: true } },
        },
      },
    },
  });
  if (!order) throw new Error("NOT_FOUND");

  if (order.status === toStatus) {
    return order;
  }

  // Paiement confirmé : transition spéciale depuis PENDING (fulfill-order)
  if (toStatus === "PAID" && order.status === "PENDING") {
    // autorisé
  } else if (toStatus === "REFUNDED") {
    // géré ailleurs — autoriser depuis états payés/expédiés
    if (!["PAID", "PREPARING", "PREPARED", "SHIPPED", "AT_RELAY", "DELIVERED"].includes(order.status)) {
      throw new Error("INVALID_STATUS_TRANSITION");
    }
  } else if (!canTransition(order.status, toStatus)) {
    throw new Error("INVALID_STATUS_TRANSITION");
  }

  if (
    toStatus === "SHIPPED" &&
    order.deliveryMethod !== "STORE_PICKUP" &&
    !order.isAudit
  ) {
    const tracking = options.trackingNumber?.trim() || order.trackingNumber;
    if (!tracking) throw new Error("TRACKING_REQUIRED");
  }

  const now = new Date();
  const data: Record<string, unknown> = { status: toStatus };
  if (options.trackingNumber?.trim()) {
    data.trackingNumber = options.trackingNumber.trim();
  }
  if (toStatus === "PREPARING") data.preparingAt = now;
  if (toStatus === "PREPARED") data.preparedAt = now;
  if (toStatus === "SHIPPED") data.shippedAt = now;
  if (toStatus === "AT_RELAY") data.atRelayAt = now;
  if (toStatus === "DELIVERED") data.deliveredAt = now;

  const updated = await prisma.$transaction(async (tx) => {
    const o = await tx.order.update({
      where: { id: orderId },
      data,
    });
    await tx.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus,
        note: options.note || null,
        changedById: options.changedById || null,
      },
    });
    return o;
  });

  if (!options.skipNotifications && !order.isAudit) {
    await runStatusSideEffects(orderId, order.status, toStatus, updated);
  }

  return updated;
}

async function runStatusSideEffects(
  orderId: string,
  from: OrderStatus,
  to: OrderStatus,
  order: {
    id: string;
    customerEmail: string;
    customerName: string | null;
    deliveryMethod: string | null;
    trackingNumber: string | null;
    pickupStoreId: string | null;
    status: OrderStatus;
  }
) {
  try {
    if (to === "PREPARING") {
      const doc = await generateAndStoreOrderDocument(orderId, "PREP_SLIP");
      // Idempotent si déjà envoyé au paiement (route A.V.A. + gérant)
      await emailOrderDocument(doc.id);
    }

    if (to === "SHIPPED") {
      const doc = await generateAndStoreOrderDocument(orderId, "DELIVERY_SLIP");
      // Bon de livraison : stocké, imprimable, pas d'envoi e-mail par défaut
      void doc;
      try {
        await sendOrderShippedEmail({
          to: order.customerEmail,
          orderId: order.id,
          customerName: order.customerName,
          trackingNumber: order.trackingNumber || "—",
          trackingUrl: getTrackingUrl(
            order.deliveryMethod as never,
            order.trackingNumber
          ),
          deliveryMethod: order.deliveryMethod as never,
        });
      } catch {
        console.error("[orders] ship email failed");
      }
    }

    if (to === "AT_RELAY" || (to === "PREPARED" && order.deliveryMethod === "STORE_PICKUP")) {
      try {
        await sendOrderReadyForPickupEmail({
          to: order.customerEmail,
          orderId: order.id,
          customerName: order.customerName,
          pickupStoreId: order.pickupStoreId,
        });
      } catch {
        console.error("[orders] ready pickup email failed");
      }
    }

    if (to === "DELIVERED") {
      try {
        await sendOrderDeliveredEmail({
          to: order.customerEmail,
          orderId: order.id,
          customerName: order.customerName,
        });
      } catch {
        console.error("[orders] delivered email failed");
      }
    }

    if (to === "CANCELLED") {
      try {
        const { releaseOrderReservations } = await import("@/lib/stock");
        await releaseOrderReservations(orderId);
      } catch {
        /* ignore */
      }
      try {
        await sendOrderCancelledEmail({
          to: order.customerEmail,
          orderId: order.id,
          customerName: order.customerName,
        });
      } catch {
        console.error("[orders] cancelled email failed");
      }
    }

    // Notification générique client (sauf transitions déjà couvertes ci-dessus)
    if (!["SHIPPED", "DELIVERED", "CANCELLED", "AT_RELAY"].includes(to)) {
      try {
        await sendOrderStatusUpdateEmail({
          to: order.customerEmail,
          orderId: order.id,
          customerName: order.customerName,
          statusLabel: orderStatusLabel(to),
          previousLabel: orderStatusLabel(from),
        });
      } catch {
        console.error("[orders] status update email failed");
      }
    }
  } catch (err) {
    console.error("[orders] side effects failed", err);
  }
}

export async function recordInitialOrderStatus(orderId: string) {
  await prisma.orderStatusHistory.create({
    data: {
      orderId,
      fromStatus: null,
      toStatus: "PENDING",
      note: "Commande créée",
    },
  });
}

export type { OrderDocumentType };
