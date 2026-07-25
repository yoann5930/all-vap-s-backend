import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { verifyVivaPayment } from "@/lib/payments/viva";
import { fulfillPaidOrder } from "@/lib/payments/fulfill-order";
import { jsonResponse, handleApiError } from "@/lib/api-utils";

/**
 * Webhook Viva.com (Payment Notification).
 * Vérifie toujours le statut via l’API avant de marquer PAID.
 * Optionnel : VIVA_WEBHOOK_KEY — si défini, exige le header Authorization Bearer correspondant.
 */
export async function POST(request: NextRequest) {
  try {
    const webhookKey = process.env.VIVA_WEBHOOK_KEY;
    if (webhookKey) {
      const auth = request.headers.get("authorization") || "";
      const token = auth.replace(/^Bearer\s+/i, "").trim();
      if (token !== webhookKey) {
        return jsonResponse({ error: "Unauthorized webhook" }, 401);
      }
    }

    const body = await request.json().catch(() => ({}));
    const orderCode =
      body.OrderCode ||
      body.orderCode ||
      body.EventData?.OrderCode ||
      body.eventData?.orderCode;

    if (!orderCode) {
      return jsonResponse({ received: true });
    }

    const code = String(orderCode);
    if (code.startsWith("TEST_")) {
      return jsonResponse({ received: true, test: true });
    }

    const order = await prisma.order.findUnique({
      where: { vivaOrderCode: code },
    });

    if (!order || order.status === "PAID") {
      return jsonResponse({ received: true });
    }

    const isPaid = await verifyVivaPayment(code);
    if (isPaid) {
      if (body.TransactionId || body.EventData?.TransactionId) {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            vivaTransactionId: String(body.TransactionId || body.EventData?.TransactionId),
          },
        });
      }
      await fulfillPaidOrder(order.id);
    }

    return jsonResponse({ received: true });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Vérification d’URL webhook Viva (GET challenge). */
export async function GET() {
  const key = process.env.VIVA_WEBHOOK_VERIFICATION_KEY || process.env.VIVA_WEBHOOK_KEY || "";
  return jsonResponse({ Key: key });
}
