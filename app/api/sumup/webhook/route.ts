import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import {
  verifySumUpPayment,
  verifySumUpWebhookSignature,
} from "@/lib/payments/sumup";
import { fulfillPaidOrder } from "@/lib/payments/fulfill-order";
import { syncOrderPaymentStatus } from "@/lib/payments/sync-order-status";
import { isTestCheckoutId } from "@/lib/payments/test-mode";
import { jsonResponse, handleApiError } from "@/lib/api-utils";

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-payload-signature");

    if (!verifySumUpWebhookSignature(rawBody, signature)) {
      return jsonResponse({ error: "Signature webhook invalide" }, 401);
    }

    let body: { id?: string; checkout_id?: string; event_type?: string };
    try {
      body = JSON.parse(rawBody || "{}");
    } catch {
      return jsonResponse({ received: true });
    }

    const checkoutId = body.id || body.checkout_id;
    if (!checkoutId) {
      return jsonResponse({ received: true });
    }

    if (isTestCheckoutId(checkoutId)) {
      return jsonResponse({ received: true, test: true });
    }

    const order = await prisma.order.findUnique({
      where: { sumupCheckoutId: checkoutId },
    });

    if (!order || order.status === "PAID") {
      return jsonResponse({ received: true });
    }

    // Toujours re-vérifier auprès de l’API SumUp (ne pas faire confiance au seul webhook)
    const isPaid = await verifySumUpPayment(checkoutId);
    if (isPaid) {
      await fulfillPaidOrder(order.id);
    }

    return jsonResponse({ received: true });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Polling succès — délègue à sync multi-provider (vérifie réellement le paiement). */
export async function GET(request: NextRequest) {
  try {
    const orderId = new URL(request.url).searchParams.get("orderId");
    if (!orderId) {
      return jsonResponse({ status: "unknown" });
    }
    const status = await syncOrderPaymentStatus(orderId);
    return jsonResponse({ status });
  } catch (error) {
    return handleApiError(error);
  }
}
