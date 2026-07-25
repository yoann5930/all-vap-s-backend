import prisma from "@/lib/prisma";
import { verifySumUpPayment } from "@/lib/payments/sumup";
import { verifyVivaPayment } from "@/lib/payments/viva";
import { isPaymentTestMode, isTestCheckoutId } from "@/lib/payments/test-mode";
import { fulfillPaidOrder } from "@/lib/payments/fulfill-order";

/**
 * Vérifie le paiement selon le provider et finalise la commande si confirmé.
 */
export async function syncOrderPaymentStatus(orderId: string): Promise<string> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
  });

  if (!order) throw new Error("NOT_FOUND");
  if (order.status === "PAID") return "PAID";
  if (order.status !== "PENDING") return order.status;

  let isPaid = false;

  if (order.paymentProvider === "SUMUP" && order.sumupCheckoutId) {
    if (isTestCheckoutId(order.sumupCheckoutId)) {
      isPaid = isPaymentTestMode();
    } else {
      isPaid = await verifySumUpPayment(order.sumupCheckoutId);
    }
  } else if (order.paymentProvider === "VIVA" && order.vivaOrderCode) {
    if (isTestCheckoutId(order.vivaOrderCode)) {
      isPaid = isPaymentTestMode();
    } else {
      isPaid = await verifyVivaPayment(order.vivaOrderCode);
    }
  }

  if (!isPaid) return order.status;

  return fulfillPaidOrder(orderId);
}
