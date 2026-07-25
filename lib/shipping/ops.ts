import type { DeliveryMethod, OrderStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { sendOrderDeliveredEmail, sendOrderShippedEmail } from "@/lib/email";
import { getTrackingUrl, makeLocalTracking } from "@/lib/shipping/options";

type LabelResult = { trackingNumber: string; carrierConfigured: boolean };

async function createMondialRelayLabel(orderId: string): Promise<LabelResult> {
  const configured = !!process.env.MONDIAL_RELAY_API_KEY;
  return {
    trackingNumber: configured
      ? `MR-PENDING-${orderId.slice(-6).toUpperCase()}`
      : makeLocalTracking("MR", orderId),
    carrierConfigured: configured,
  };
}

async function createRelaisColisLabel(orderId: string): Promise<LabelResult> {
  const configured = !!process.env.RELAIS_COLIS_API_KEY;
  return {
    trackingNumber: configured
      ? `RC-PENDING-${orderId.slice(-6).toUpperCase()}`
      : makeLocalTracking("RC", orderId),
    carrierConfigured: configured,
  };
}

async function createColissimoLabel(orderId: string): Promise<LabelResult> {
  const configured = !!process.env.COLISSIMO_API_KEY;
  return {
    trackingNumber: configured
      ? `COL-PENDING-${orderId.slice(-6).toUpperCase()}`
      : makeLocalTracking("COL", orderId),
    carrierConfigured: configured,
  };
}

export const shippingProviders = {
  mondialRelay: {
    id: "mondial-relay" as const,
    isConfigured: () => !!process.env.MONDIAL_RELAY_API_KEY,
    createLabel: createMondialRelayLabel,
  },
  relaisColis: {
    id: "relais-colis" as const,
    isConfigured: () => !!process.env.RELAIS_COLIS_API_KEY,
    createLabel: createRelaisColisLabel,
  },
  colissimo: {
    id: "colissimo" as const,
    isConfigured: () => !!process.env.COLISSIMO_API_KEY,
    createLabel: createColissimoLabel,
  },
};

/**
 * Prépare le colis : génère / récupère un n° de suivi sans changer le statut.
 */
export async function prepareParcel(orderId: string): Promise<{
  orderId: string;
  trackingNumber: string;
  deliveryMethod: DeliveryMethod | null;
  carrierConfigured: boolean;
}> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("NOT_FOUND");
  if (order.status !== "PAID" && order.status !== "SHIPPED") {
    throw new Error("ORDER_NOT_SHIPPABLE");
  }

  if (order.trackingNumber) {
    return {
      orderId,
      trackingNumber: order.trackingNumber,
      deliveryMethod: order.deliveryMethod,
      carrierConfigured: false,
    };
  }

  if (order.deliveryMethod === "STORE_PICKUP") {
    const trackingNumber = makeLocalTracking("PICKUP", orderId);
    await prisma.order.update({
      where: { id: orderId },
      data: { trackingNumber },
    });
    return {
      orderId,
      trackingNumber,
      deliveryMethod: order.deliveryMethod,
      carrierConfigured: true,
    };
  }

  let label: LabelResult;
  switch (order.deliveryMethod) {
    case "MONDIAL_RELAY":
      label = await shippingProviders.mondialRelay.createLabel(orderId);
      break;
    case "RELAIS_COLIS":
      label = await shippingProviders.relaisColis.createLabel(orderId);
      break;
    case "COLISSIMO":
      label = await shippingProviders.colissimo.createLabel(orderId);
      break;
    default:
      label = {
        trackingNumber: makeLocalTracking("SHIP", orderId),
        carrierConfigured: false,
      };
  }

  await prisma.order.update({
    where: { id: orderId },
    data: { trackingNumber: label.trackingNumber },
  });

  return {
    orderId,
    trackingNumber: label.trackingNumber,
    deliveryMethod: order.deliveryMethod,
    carrierConfigured: label.carrierConfigured,
  };
}

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CANCELLED"],
  PAID: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
  REFUNDED: [],
};

/**
 * Change le statut livraison avec règles métier + notification.
 */
export async function updateOrderShippingStatus(
  orderId: string,
  nextStatus: OrderStatus
): Promise<{
  id: string;
  status: OrderStatus;
  trackingNumber: string | null;
  trackingUrl: string | null;
}> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("NOT_FOUND");

  const allowed = ALLOWED_TRANSITIONS[order.status] || [];
  if (!allowed.includes(nextStatus)) {
    throw new Error("INVALID_STATUS_TRANSITION");
  }

  if (nextStatus === "SHIPPED") {
    const prepared = await prepareParcel(orderId);
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: "SHIPPED",
        trackingNumber: prepared.trackingNumber,
        shippedAt: new Date(),
      },
    });

    try {
      await sendOrderShippedEmail({
        to: order.customerEmail,
        orderId: order.id,
        customerName: order.customerName,
        trackingNumber: prepared.trackingNumber,
        trackingUrl: getTrackingUrl(order.deliveryMethod, prepared.trackingNumber),
        deliveryMethod: order.deliveryMethod,
      });
    } catch (err) {
      console.error("[shipping] email shipped failed:", err);
    }

    return {
      id: updated.id,
      status: updated.status,
      trackingNumber: updated.trackingNumber,
      trackingUrl: getTrackingUrl(updated.deliveryMethod, updated.trackingNumber),
    };
  }

  if (nextStatus === "DELIVERED") {
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { status: "DELIVERED", deliveredAt: new Date() },
    });

    try {
      await sendOrderDeliveredEmail({
        to: order.customerEmail,
        orderId: order.id,
        customerName: order.customerName,
      });
    } catch (err) {
      console.error("[shipping] email delivered failed:", err);
    }

    return {
      id: updated.id,
      status: updated.status,
      trackingNumber: updated.trackingNumber,
      trackingUrl: getTrackingUrl(updated.deliveryMethod, updated.trackingNumber),
    };
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { status: nextStatus },
  });

  return {
    id: updated.id,
    status: updated.status,
    trackingNumber: updated.trackingNumber,
    trackingUrl: getTrackingUrl(updated.deliveryMethod, updated.trackingNumber),
  };
}
