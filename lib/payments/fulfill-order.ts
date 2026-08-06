import prisma from "@/lib/prisma";
import {
  sendAdminNewOrderEmail,
  sendOrderConfirmationEmail,
} from "@/lib/email";
import {
  applyStoreSale,
  getStoreStock,
  setStoreStockQuantity,
} from "@/lib/catalog/stock";
import { storeIdToStockCode } from "@/lib/catalog/normalize";

/**
 * Passe une commande PENDING → PAID de façon idempotente :
 * déstockage boutique (pickupStoreId → HAUTMONT|LE_QUESNOY, défaut Hautmont),
 * consommation coupon, crédit fidélité + emails.
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

  if (result.order) {
    const locationCode = storeIdToStockCode(result.order.pickupStoreId);
    for (const item of result.order.items) {
      await applyStoreSale({
        productId: item.productId,
        quantity: item.quantity,
        externalReference: `order:${orderId}:item:${item.id}`,
        source: "ecommerce",
        locationCode,
        pickupStoreId: result.order.pickupStoreId,
      });
      await prisma.product.update({
        where: { id: item.productId },
        data: { salesCount: { increment: item.quantity } },
      });
    }
  }

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
 * Remboursement local : REFUNDED + restock boutique (l’appel PSP doit être fait avant).
 * Restock sur la boutique d’origine (pickupStoreId), défaut Hautmont.
 */
export async function fulfillRefundedOrder(orderId: string): Promise<"REFUNDED" | string> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });

  if (!order) throw new Error("NOT_FOUND");
  if (order.status === "REFUNDED") return "REFUNDED";
  if (order.status !== "PAID" && order.status !== "SHIPPED" && order.status !== "DELIVERED") {
    throw new Error("ORDER_NOT_REFUNDABLE");
  }

  const locationCode = storeIdToStockCode(order.pickupStoreId);

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: { status: "REFUNDED" },
    });

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
  });

  for (const item of order.items) {
    let variant = await prisma.productVariant.findFirst({
      where: { productId: item.productId, active: true },
      orderBy: { createdAt: "asc" },
    });
    if (!variant) {
      variant = await prisma.productVariant.create({
        data: { productId: item.productId, name: "Standard" },
      });
    }
    const current = await getStoreStock(item.productId, locationCode);
    await setStoreStockQuantity({
      productId: item.productId,
      variantId: variant.id,
      locationCode,
      quantity: current.quantity + item.quantity,
      source: "ecommerce_refund",
      movementType: "RELEASE",
      externalReference: `refund:${orderId}:item:${item.id}`,
    });
    await prisma.product.update({
      where: { id: item.productId },
      data: { salesCount: { decrement: item.quantity } },
    });
  }

  return "REFUNDED";
}
