import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { verifySumUpPayment } from "@/lib/sumup";
import { jsonResponse, handleApiError } from "@/lib/api-utils";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const checkoutId = body.id || body.checkout_id;

    if (!checkoutId) {
      return jsonResponse({ received: true });
    }

    const order = await prisma.order.findUnique({
      where: { sumupCheckoutId: checkoutId },
      include: { items: true },
    });

    if (!order || order.status === "PAID") {
      return jsonResponse({ received: true });
    }

    const isPaid = await verifySumUpPayment(checkoutId);

    if (isPaid) {
      await prisma.$transaction([
        prisma.order.update({
          where: { id: order.id },
          data: { status: "PAID" },
        }),
        ...order.items.map((item) =>
          prisma.product.update({
            where: { id: item.productId },
            data: { stock: { decrement: item.quantity } },
          })
        ),
      ]);
    }

    return jsonResponse({ received: true });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("orderId");

    if (!orderId) {
      return jsonResponse({ status: "unknown" });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order?.sumupCheckoutId) {
      return jsonResponse({ status: order?.status || "unknown" });
    }

    const isPaid = await verifySumUpPayment(order.sumupCheckoutId);

    if (isPaid && order.status === "PENDING") {
      const items = await prisma.orderItem.findMany({
        where: { orderId: order.id },
      });

      await prisma.$transaction([
        prisma.order.update({
          where: { id: order.id },
          data: { status: "PAID" },
        }),
        ...items.map((item) =>
          prisma.product.update({
            where: { id: item.productId },
            data: { stock: { decrement: item.quantity } },
          })
        ),
      ]);
    }

    const updated = await prisma.order.findUnique({ where: { id: orderId } });
    return jsonResponse({ status: updated?.status });
  } catch (error) {
    return handleApiError(error);
  }
}
