import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { createSumUpCheckout } from "@/lib/sumup";
import { getBaseUrl } from "@/lib/utils";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api-utils";

const checkoutSchema = z.object({
  orderId: z.string(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId } = checkoutSchema.parse(body);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true } } },
    });

    if (!order) {
      return errorResponse("Commande introuvable", 404);
    }

    if (order.status !== "PENDING") {
      return errorResponse("Cette commande a déjà été traitée", 400);
    }

    const baseUrl = getBaseUrl();
    const checkout = await createSumUpCheckout({
      checkoutReference: order.id,
      amountCents: order.totalCents,
      description: `All Vap's - Commande ${order.id.slice(-8)}`,
      returnUrl: `${baseUrl}/checkout/success?orderId=${order.id}`,
    });

    await prisma.order.update({
      where: { id: orderId },
      data: { sumupCheckoutId: checkout.id },
    });

    return jsonResponse({
      checkoutId: checkout.id,
      amount: checkout.amount,
      currency: checkout.currency,
      status: checkout.status,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
