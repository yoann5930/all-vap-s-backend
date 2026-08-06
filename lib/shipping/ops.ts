import type { DeliveryMethod, OrderStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getTrackingUrl } from "@/lib/shipping/options";
import { transitionOrderStatus } from "@/lib/orders/workflow";
import {
  createCarrierShipment,
  deliveryMethodToCarrier,
} from "@/lib/shipping/carriers";

/**
 * Prépare le colis. Pour transporteur : tracking manuel ou API réelle si branchée.
 * N'invente jamais de numéro de suivi.
 */
export async function prepareParcel(
  orderId: string,
  options?: { trackingNumber?: string | null; changedById?: string }
): Promise<{
  orderId: string;
  trackingNumber: string | null;
  deliveryMethod: DeliveryMethod | null;
  carrierConfigured: boolean;
  needsManualTracking: boolean;
}> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("NOT_FOUND");
  if (!["PAID", "PREPARING", "PREPARED", "SHIPPED"].includes(order.status)) {
    throw new Error("ORDER_NOT_SHIPPABLE");
  }

  const manualTracking = options?.trackingNumber?.trim() || null;

  if (order.status === "PAID") {
    await transitionOrderStatus(orderId, "PREPARING", {
      changedById: options?.changedById,
      note: "Préparation démarrée",
      skipNotifications: false,
    });
  }

  if (order.deliveryMethod === "STORE_PICKUP") {
    return {
      orderId,
      trackingNumber: order.trackingNumber,
      deliveryMethod: order.deliveryMethod,
      carrierConfigured: true,
      needsManualTracking: false,
    };
  }

  const carrier = deliveryMethodToCarrier(order.deliveryMethod);
  let carrierConfigured = false;
  if (carrier) {
    const shipment = await createCarrierShipment(carrier, {
      orderId,
      recipientName: order.customerName || order.customerEmail,
      recipientEmail: order.customerEmail,
      addressLine: order.shippingAddress || "",
      postalCode: "",
      city: "",
    });
    carrierConfigured = shipment.configured;
    if (shipment.ok && shipment.trackingNumber) {
      await prisma.order.update({
        where: { id: orderId },
        data: { trackingNumber: shipment.trackingNumber },
      });
      return {
        orderId,
        trackingNumber: shipment.trackingNumber,
        deliveryMethod: order.deliveryMethod,
        carrierConfigured: true,
        needsManualTracking: false,
      };
    }
  }

  if (manualTracking) {
    await prisma.order.update({
      where: { id: orderId },
      data: { trackingNumber: manualTracking },
    });
  }

  const fresh = await prisma.order.findUnique({ where: { id: orderId } });
  return {
    orderId,
    trackingNumber: fresh?.trackingNumber || null,
    deliveryMethod: order.deliveryMethod,
    carrierConfigured,
    needsManualTracking: !fresh?.trackingNumber,
  };
}

/**
 * Change le statut livraison via le workflow unifié.
 */
export async function updateOrderShippingStatus(
  orderId: string,
  nextStatus: OrderStatus,
  options?: { trackingNumber?: string | null; changedById?: string; note?: string }
): Promise<{
  id: string;
  status: OrderStatus;
  trackingNumber: string | null;
  trackingUrl: string | null;
}> {
  if (nextStatus === "PREPARING" || nextStatus === "PREPARED") {
    const updated = await transitionOrderStatus(orderId, nextStatus, {
      changedById: options?.changedById,
      note: options?.note,
      trackingNumber: options?.trackingNumber,
    });
    return {
      id: updated.id,
      status: updated.status,
      trackingNumber: updated.trackingNumber,
      trackingUrl: getTrackingUrl(updated.deliveryMethod, updated.trackingNumber),
    };
  }

  if (nextStatus === "SHIPPED") {
    const prepared = await prepareParcel(orderId, {
      trackingNumber: options?.trackingNumber,
      changedById: options?.changedById,
    });
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new Error("NOT_FOUND");

    if (order.deliveryMethod !== "STORE_PICKUP" && !prepared.trackingNumber) {
      throw new Error("TRACKING_REQUIRED");
    }

    // Passage PREPARED si encore en PAID/PREPARING
    if (order.status === "PAID" || order.status === "PREPARING") {
      await transitionOrderStatus(orderId, "PREPARED", {
        changedById: options?.changedById,
        note: "Préparée avant expédition",
        skipNotifications: true,
      });
    }

    const updated = await transitionOrderStatus(orderId, "SHIPPED", {
      changedById: options?.changedById,
      trackingNumber: prepared.trackingNumber,
      note: options?.note || "Commande expédiée",
    });

    return {
      id: updated.id,
      status: updated.status,
      trackingNumber: updated.trackingNumber,
      trackingUrl: getTrackingUrl(updated.deliveryMethod, updated.trackingNumber),
    };
  }

  if (nextStatus === "AT_RELAY") {
    const updated = await transitionOrderStatus(orderId, "AT_RELAY", {
      changedById: options?.changedById,
      note: options?.note || "Disponible en point relais",
    });
    return {
      id: updated.id,
      status: updated.status,
      trackingNumber: updated.trackingNumber,
      trackingUrl: getTrackingUrl(updated.deliveryMethod, updated.trackingNumber),
    };
  }

  const updated = await transitionOrderStatus(orderId, nextStatus, {
    changedById: options?.changedById,
    trackingNumber: options?.trackingNumber,
    note: options?.note,
  });

  return {
    id: updated.id,
    status: updated.status,
    trackingNumber: updated.trackingNumber,
    trackingUrl: getTrackingUrl(updated.deliveryMethod, updated.trackingNumber),
  };
}
