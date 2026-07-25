import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { refundSumUpCheckout, isSumUpConfigured } from "@/lib/payments/sumup";
import { refundVivaOrder, isVivaConfigured } from "@/lib/payments/viva";
import { fulfillRefundedOrder } from "@/lib/payments/fulfill-order";
import { isTestCheckoutId, isPaymentTestMode } from "@/lib/payments/test-mode";

const schema = z.object({
  orderId: z.string(),
});

/**
 * Remboursement admin — appelle le PSP puis bascule la commande en REFUNDED + restock.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuth("ADMIN");
    const { orderId } = schema.parse(await request.json());

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new Error("NOT_FOUND");

    if (order.paymentProvider === "SUMUP" && order.sumupCheckoutId) {
      if (isTestCheckoutId(order.sumupCheckoutId)) {
        if (!isPaymentTestMode()) throw new Error("SUMUP_NOT_CONFIGURED");
      } else {
        if (!isSumUpConfigured()) throw new Error("SUMUP_NOT_CONFIGURED");
        await refundSumUpCheckout(order.sumupCheckoutId, order.totalCents);
      }
    } else if (order.paymentProvider === "VIVA" && order.vivaOrderCode) {
      if (isTestCheckoutId(order.vivaOrderCode)) {
        if (!isPaymentTestMode()) throw new Error("VIVA_NOT_CONFIGURED");
      } else {
        if (!isVivaConfigured()) throw new Error("VIVA_NOT_CONFIGURED");
        await refundVivaOrder(order.vivaOrderCode, order.totalCents);
      }
    } else {
      throw new Error("ORDER_NOT_REFUNDABLE");
    }

    const status = await fulfillRefundedOrder(orderId);
    return jsonResponse({ orderId, status });
  } catch (error) {
    return handleApiError(error);
  }
}
