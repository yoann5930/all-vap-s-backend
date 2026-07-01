import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { createSumUpCheckout, isSumUpConfigured } from "@/lib/payments/sumup";
import { createVivaCheckout, isVivaConfigured } from "@/lib/payments/viva";
import { getBaseUrl } from "@/lib/utils";

const schema = z.object({
  orderId: z.string(),
  provider: z.enum(["viva", "sumup"]).default("sumup"),
});

export async function POST(request: NextRequest) {
  try {
    const { orderId, provider } = schema.parse(await request.json());

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) throw new Error("NOT_FOUND");
    if (order.status !== "PENDING") {
      return jsonResponse({ error: "Commande déjà traitée" }, 400);
    }

    const baseUrl = getBaseUrl();
    const returnUrl = `${baseUrl}/checkout/success?orderId=${order.id}`;

    if (provider === "viva") {
      if (!isVivaConfigured()) throw new Error("VIVA_NOT_CONFIGURED");
      const checkout = await createVivaCheckout({
        orderId: order.id,
        amountCents: order.totalCents,
        customerEmail: order.customerEmail,
        description: `All Vap's - Commande ${order.id.slice(-8)}`,
        returnUrl,
      });

      await prisma.order.update({
        where: { id: orderId },
        data: {
          paymentProvider: "VIVA",
          vivaOrderCode: String(checkout.orderCode),
        },
      });

      return jsonResponse({
        provider: "viva",
        checkoutId: String(checkout.orderCode),
        redirectUrl: checkout.redirectUrl,
        amount: order.totalCents / 100,
        currency: "EUR",
      });
    }

    if (!isSumUpConfigured()) throw new Error("SUMUP_NOT_CONFIGURED");
    const checkout = await createSumUpCheckout({
      checkoutReference: order.id,
      amountCents: order.totalCents,
      description: `All Vap's - Commande ${order.id.slice(-8)}`,
      returnUrl,
    });

    await prisma.order.update({
      where: { id: orderId },
      data: { paymentProvider: "SUMUP", sumupCheckoutId: checkout.id },
    });

    return jsonResponse({
      provider: "sumup",
      checkoutId: checkout.id,
      amount: checkout.amount,
      currency: checkout.currency,
      status: checkout.status,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET() {
  return jsonResponse({
    providers: [
      { id: "viva", name: "Viva.com", configured: isVivaConfigured() },
      { id: "sumup", name: "SumUp", configured: isSumUpConfigured() },
    ],
  });
}
