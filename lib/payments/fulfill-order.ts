import prisma from "@/lib/prisma";
import {
  sendAdminNewOrderEmail,
  sendOrderConfirmationEmail,
} from "@/lib/email";

/**
 * Passe une commande PENDING → PAID de façon idempotente :
 * déstockage, consommation coupon, crédit fidélité + emails.
 */
export async function fulfillPaidOrder(orderId: string): Promise<"PAID" | string> {
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        items: { include: { product: { select: { name: true } } } },
      },
    });

    if (!order) throw new Error("NOT_FOUND");
    if (order.status === "PAID") return { status: "PAID" as const, notify: false, order: null };
    if (order.status !== "PENDING") return { status: order.status, notify: false, order: null };

    await tx.order.update({
      where: { id: order.id },
      data: { status: "PAID" },
    });

    for (const item of order.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity }, salesCount: { increment: item.quantity } },
      });
    }

    if (order.couponCode) {
      await tx.coupon.updateMany({
        where: { code: order.couponCode.toUpperCase() },
        data: { usedCount: { increment: 1 } },
      });
    }

    if (order.userId && order.loyaltyPointsEarn > 0) {
      await tx.user.update({
        where: { id: order.userId },
        data: { loyaltyPoints: { increment: order.loyaltyPointsEarn } },
      });
    }

    return { status: "PAID" as const, notify: true, order };
  });

  if (result.notify && result.order) {
    const order = result.order;
    try {
      await sendOrderConfirmationEmail({
        to: order.customerEmail,
        orderId: order.id,
        customerName: order.customerName,
        totalCents: order.totalCents,
        items: order.items.map((i) => ({
          name: i.product.name,
          quantity: i.quantity,
          priceCents: i.priceCents,
        })),
      });
    } catch (err) {
      console.error("[fulfill] confirmation email failed:", err);
    }
    try {
      await sendAdminNewOrderEmail({
        orderId: order.id,
        customerEmail: order.customerEmail,
        totalCents: order.totalCents,
      });
    } catch (err) {
      console.error("[fulfill] admin email failed:", err);
    }
  }

  return result.status;
}

/**
 * Remboursement local : REFUNDED + restock (l’appel PSP doit être fait avant).
 */
export async function fulfillRefundedOrder(orderId: string): Promise<"REFUNDED" | string> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) throw new Error("NOT_FOUND");
    if (order.status === "REFUNDED") return "REFUNDED";
    if (order.status !== "PAID" && order.status !== "SHIPPED" && order.status !== "DELIVERED") {
      throw new Error("ORDER_NOT_REFUNDABLE");
    }

    await tx.order.update({
      where: { id: order.id },
      data: { status: "REFUNDED" },
    });

    for (const item of order.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: {
          stock: { increment: item.quantity },
          salesCount: { decrement: item.quantity },
        },
      });
    }

    if (order.userId && order.loyaltyPointsEarn > 0) {
      await tx.user.update({
        where: { id: order.userId },
        data: { loyaltyPoints: { decrement: order.loyaltyPointsEarn } },
      });
    }

    if (order.couponCode) {
      await tx.coupon.updateMany({
        where: { code: order.couponCode.toUpperCase(), usedCount: { gt: 0 } },
        data: { usedCount: { decrement: 1 } },
      });
    }

    return "REFUNDED";
  });
}
