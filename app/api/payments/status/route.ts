import { NextRequest } from "next/server";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { syncOrderPaymentStatus } from "@/lib/payments/sync-order-status";
import prisma from "@/lib/prisma";

/** Statut paiement multi-provider (SumUp + Viva) pour la page succès. */
export async function GET(request: NextRequest) {
  try {
    const orderId = new URL(request.url).searchParams.get("orderId");
    if (!orderId) {
      return jsonResponse({ status: "unknown" });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, paymentProvider: true },
    });

    if (!order) throw new Error("NOT_FOUND");

    const status = await syncOrderPaymentStatus(orderId);
    return jsonResponse({
      status,
      provider: order.paymentProvider?.toLowerCase() ?? null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
