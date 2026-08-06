import prisma from "@/lib/prisma";
import {
  sendAdminNewOrderEmail,
  sendOrderConfirmationEmail,
  sendOrderRefundedEmail,
} from "@/lib/email";
import { stores } from "@/lib/stores";
import { commitSaleForOrder } from "@/lib/stock";
import { applyGlobalRefund } from "@/lib/catalog/stock";
import { awardLoyaltyPoints, revokeLoyaltyPoints } from "@/lib/loyalty";
import { generatePaidOrderDocuments } from "@/lib/documents/service";
import { startCarrierShipmentForOrder } from "@/lib/shipping/workflow";

/**
 * Passe une commande PENDING → PAID de façon idempotente :
 * statut PAID + coupon/fidélité, puis déstockage atomique StockLevel.
 */
export async function fulfillPaidOrder(orderId: string): Promise<"PAID" | string> {
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            product: { select: { name: true } },
            variant: { select: { name: true, nicotineMg: true, nicotineLabel: true } },
          },
        },
      },
    });

    if (!order) throw new Error("NOT_FOUND");
    if (order.status === "PAID") return { status: "PAID" as const, notify: false, order: null };
    if (order.status !== "PENDING") return { status: order.status, notify: false, order: null };

    await tx.order.update({
      where: { id: order.id },
      data: { status: "PAID" },
    });

    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: "PENDING",
        toStatus: "PAID",
        note: "Paiement confirmé",
      },
    });

    if (order.couponCode) {
      await tx.coupon.updateMany({
        where: { code: order.couponCode.toUpperCase() },
        data: { usedCount: { increment: 1 } },
      });
    }

    return { status: "PAID" as const, notify: true, order };
  });

  if (result.status === "PAID" && result.notify && result.order?.userId && result.order.loyaltyPointsEarn > 0) {
    if ((result.order as { isAudit?: boolean }).isAudit) {
      console.log("[fulfill] skip loyalty — commande AUDIT_ONLY");
    } else {
    try {
      await awardLoyaltyPoints({
        userId: result.order.userId,
        points: result.order.loyaltyPointsEarn,
        reason: "order_earn",
        orderId: result.order.id,
        externalRef: `order-earn:${result.order.id}`,
      });
    } catch (err) {
      console.error("[fulfill] loyalty earn failed", err);
    }
    }
  }

  if (result.status === "PAID") {
    const full = await prisma.order.findUnique({
      where: { id: orderId },
      select: { isAudit: true, auditAllowOutOfStock: true },
    });
    if (full?.isAudit && full.auditAllowOutOfStock) {
      console.log("[fulfill] skip stock commit — AUDIT_ONLY hors stock");
    } else {
      const stockCommit = await commitSaleForOrder(orderId);
      if (!stockCommit.ok) {
        console.error("[fulfill] CRITICAL stock commit failed after PAID", orderId);
      } else {
        try {
          const { enqueueWebSaleReconciliation } = await import("@/lib/sumup/reconciliation");
          const orderLines = await prisma.orderItem.findMany({
            where: { orderId },
            include: { product: { select: { name: true } } },
          });
          await enqueueWebSaleReconciliation({
            orderId,
            lines: orderLines.map((i) => ({
              productId: i.productId,
              variantId: i.variantId,
              quantity: i.quantity,
              name: i.product.name,
            })),
          });
        } catch (err) {
          console.error("[fulfill] reconciliation enqueue failed", err);
        }
      }
    }
  }

  if (result.notify && result.order) {
    const order = result.order;
    const pickupStore = order.pickupStoreId
      ? stores.find((s) => s.id === order.pickupStoreId)
      : null;
    try {
      await sendOrderConfirmationEmail({
        to: order.customerEmail,
        orderId: order.id,
        customerName: order.customerName,
        totalCents: order.totalCents,
        discountCents: order.discountCents,
        shippingCents: order.shippingCents,
        shippingAddress: order.shippingAddress,
        deliveryMethod: order.deliveryMethod,
        pickupStoreLabel: pickupStore
          ? `${pickupStore.name} — ${pickupStore.address}, ${pickupStore.postalCode} ${pickupStore.city}`
          : null,
        customerId: order.userId || undefined,
        items: order.items.map((i) => ({
          name: i.product.name,
          quantity: i.quantity,
          priceCents: i.priceCents,
          variantLabel: i.variant
            ? [
                i.variant.name,
                i.variant.nicotineLabel ||
                  (i.variant.nicotineMg != null ? `${i.variant.nicotineMg} mg` : null),
              ]
                .filter(Boolean)
                .join(" · ")
            : null,
          isGift: i.priceCents === 0,
        })),
      });
    } catch {
      console.error("[fulfill] confirmation email failed");
    }
    try {
      await sendAdminNewOrderEmail({
        orderId: order.id,
        customerEmail: order.customerEmail,
        totalCents: order.totalCents,
      });
    } catch {
      console.error("[fulfill] admin email failed");
    }
    try {
      await generatePaidOrderDocuments(order.id);
    } catch (err) {
      console.error("[fulfill] documents generation/email failed", err);
    }
    try {
      await startCarrierShipmentForOrder(order.id);
    } catch (err) {
      console.error("[fulfill] carrier shipment workflow failed (non-blocking)", err);
    }
    try {
      const { emitOrderLifecycleEvent } = await import("@/lib/notifications/bus");
      const auditOrder = await prisma.order.findUnique({
        where: { id: order.id },
        select: { isAudit: true },
      });
      await emitOrderLifecycleEvent({
        type: "order.payment_confirmed",
        orderId: order.id,
        status: "PAID",
        totalCents: order.totalCents,
        deliveryMethod: order.deliveryMethod,
        isTest: !!auditOrder?.isAudit,
      });
    } catch (err) {
      console.error("[fulfill] notification bus failed (non-blocking)", err);
    }
  }

  return result.status;
}

/**
 * Remboursement local : REFUNDED + restock StockLevel (l’appel PSP doit être fait avant).
 */
export async function fulfillRefundedOrder(orderId: string): Promise<"REFUNDED" | string> {
  const outcome = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) throw new Error("NOT_FOUND");
    if (order.status === "REFUNDED") {
      return { status: "REFUNDED" as const, notify: false, order: null };
    }
    if (order.status !== "PAID" && order.status !== "PREPARING" && order.status !== "PREPARED" && order.status !== "SHIPPED" && order.status !== "AT_RELAY" && order.status !== "DELIVERED") {
      throw new Error("ORDER_NOT_REFUNDABLE");
    }

    await tx.order.update({
      where: { id: order.id },
      data: { status: "REFUNDED" },
    });

    if (order.couponCode) {
      await tx.coupon.updateMany({
        where: { code: order.couponCode.toUpperCase(), usedCount: { gt: 0 } },
        data: { usedCount: { decrement: 1 } },
      });
    }

    return { status: "REFUNDED" as const, notify: true, order };
  });

  if (outcome.notify && outcome.order?.userId && outcome.order.loyaltyPointsEarn > 0) {
    try {
      await revokeLoyaltyPoints({
        userId: outcome.order.userId,
        points: outcome.order.loyaltyPointsEarn,
        reason: "order_refund",
        orderId: outcome.order.id,
        externalRef: `order-refund:${outcome.order.id}`,
      });
    } catch (err) {
      console.error("[fulfill] loyalty revoke failed", err);
    }
  }

  if (outcome.notify && outcome.order) {
    for (const item of outcome.order.items) {
      await applyGlobalRefund({
        productId: item.productId,
        quantity: item.quantity,
        externalReference: `refund:order:${orderId}:${item.productId}:${item.variantId || "base"}`,
        source: "ecommerce_refund",
      });
      if (item.variantId) {
        await prisma.productVariant.updateMany({
          where: { id: item.variantId },
          data: { stock: { increment: item.quantity } },
        });
      }
    }
    try {
      await sendOrderRefundedEmail({
        to: outcome.order.customerEmail,
        orderId: outcome.order.id,
        customerName: outcome.order.customerName,
        totalCents: outcome.order.totalCents,
      });
    } catch {
      console.error("[fulfill] refund email failed");
    }
  }

  return outcome.status;
}
