import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { createSumUpCheckout, isSumUpConfigured } from "@/lib/payments/sumup";
import { createVivaCheckout, isVivaConfigured } from "@/lib/payments/viva";
import { isPaymentTestMode, makeTestCheckoutId } from "@/lib/payments/test-mode";
import { getBaseUrl } from "@/lib/utils";
import { getAuthUser } from "@/lib/jwt";

const schema = z.object({
  orderId: z.string(),
  provider: z.enum(["viva", "sumup"]).default("sumup"),
  checkoutToken: z.string().min(16).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { orderId, provider, checkoutToken } = schema.parse(await request.json());

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) throw new Error("NOT_FOUND");
    if (order.status !== "PENDING") {
      return jsonResponse({ error: "Commande déjà traitée" }, 400);
    }

    // Autorisation : token de checkout (guest) OU propriétaire / admin
    const auth = await getAuthUser();
    const tokenOk = !!checkoutToken && !!order.checkoutToken && checkoutToken === order.checkoutToken;
    const ownerOk = !!auth && (auth.role === "ADMIN" || auth.userId === order.userId);
    if (!tokenOk && !ownerOk) {
      throw new Error("CHECKOUT_FORBIDDEN");
    }

    const baseUrl = getBaseUrl();
    const returnUrl = `${baseUrl}/checkout/success?orderId=${order.id}`;
    const testMode = isPaymentTestMode();

    if (provider === "viva") {
      if (!isVivaConfigured()) {
        if (!testMode) throw new Error("VIVA_NOT_CONFIGURED");
        const checkoutId = makeTestCheckoutId(order.id);
        await prisma.order.update({
          where: { id: orderId },
          data: { paymentProvider: "VIVA", vivaOrderCode: checkoutId },
        });
        return jsonResponse({
          provider: "viva",
          checkoutId,
          redirectUrl: `${returnUrl}&provider=viva`,
          amount: order.totalCents / 100,
          currency: "EUR",
          testMode: true,
        });
      }

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

    if (!isSumUpConfigured()) {
      if (!testMode) throw new Error("SUMUP_NOT_CONFIGURED");
      const checkoutId = makeTestCheckoutId(order.id);
      await prisma.order.update({
        where: { id: orderId },
        data: { paymentProvider: "SUMUP", sumupCheckoutId: checkoutId },
      });
      return jsonResponse({
        provider: "sumup",
        checkoutId,
        redirectUrl: `${returnUrl}&provider=sumup`,
        amount: order.totalCents / 100,
        currency: "EUR",
        status: "PENDING",
        testMode: true,
      });
    }

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

    // SumUp n'a pas de hosted redirect natif : page interne + widget carte
    const sumupPayUrl = `${baseUrl}/checkout/pay?orderId=${encodeURIComponent(order.id)}&checkoutId=${encodeURIComponent(checkout.id)}&provider=sumup`;

    return jsonResponse({
      provider: "sumup",
      checkoutId: checkout.id,
      redirectUrl: sumupPayUrl,
      amount: checkout.amount,
      currency: checkout.currency,
      status: checkout.status,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET() {
  const testMode = isPaymentTestMode();
  return jsonResponse({
    testMode,
    providers: [
      {
        id: "viva",
        name: "Viva.com",
        configured: isVivaConfigured() || testMode,
      },
      {
        id: "sumup",
        name: "SumUp",
        configured: isSumUpConfigured() || testMode,
      },
    ],
  });
}
