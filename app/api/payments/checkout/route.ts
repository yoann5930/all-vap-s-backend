import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { createSumUpCheckout, isSumUpConfigured } from "@/lib/payments/sumup";
import { createVivaCheckout, isVivaConfigured } from "@/lib/payments/viva";
import { isPaymentTestMode, makeTestCheckoutId } from "@/lib/payments/test-mode";
import { resolveOnlinePaymentProvider } from "@/lib/payments/resolve-provider";
import { getBaseUrl } from "@/lib/utils";
import { getAuthUser, requireAuth } from "@/lib/jwt";
import { revalidateOrderStock, releaseOrderReservations } from "@/lib/stock";

const schema = z.object({
  orderId: z.string(),
  checkoutToken: z.string().min(16).optional(),
  /** Ignoré côté public — la passerelle est choisie serveur */
  provider: z.enum(["viva", "sumup"]).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { orderId, checkoutToken } = schema.parse(await request.json());

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) throw new Error("NOT_FOUND");
    if (order.status !== "PENDING") {
      return jsonResponse(
        { error: "Cette commande a déjà été traitée." },
        400
      );
    }

    // Compte obligatoire : propriétaire ou admin (token guest désactivé)
    const auth = await getAuthUser();
    const ownerOk = !!auth && (auth.role === "ADMIN" || auth.userId === order.userId);
    const tokenOk =
      !!checkoutToken &&
      !!order.checkoutToken &&
      checkoutToken === order.checkoutToken &&
      !!order.userId &&
      !!auth &&
      auth.userId === order.userId;
    if (!ownerOk && !tokenOk) {
      throw new Error("CHECKOUT_FORBIDDEN");
    }
    if (!order.userId) {
      throw new Error("UNAUTHORIZED");
    }

    // Dernier contrôle stock AVANT toute demande de paiement.
    // Commande audit : jamais d’engagement du stock réel.
    if (order.isAudit) {
      // AUDIT_ONLY : pas de PSP réel, pas de destock, pas d’annulation stock.
    } else {
      const stockCheck = await revalidateOrderStock(order.id);
      if (!stockCheck.ok) {
        await prisma.order.update({
          where: { id: order.id },
          data: { status: "CANCELLED" },
        });
        await releaseOrderReservations(order.id);
        return jsonResponse(
          {
            error: stockCheck.message,
            code: stockCheck.code || "STOCK_INSUFFICIENT",
            lines: stockCheck.lines,
          },
          409
        );
      }
    }

    const baseUrl = getBaseUrl();
    const returnUrl = `${baseUrl}/checkout/success?orderId=${order.id}`;

    // Commande AUDIT_ONLY : jamais de PSP réel, même si Viva/SumUp absents.
    if (order.isAudit) {
      const checkoutId = makeTestCheckoutId(order.id);
      await prisma.order.update({
        where: { id: orderId },
        data: {
          paymentProvider: "VIVA",
          vivaOrderCode: checkoutId,
        },
      });
      return jsonResponse({
        checkoutId,
        redirectUrl: `${returnUrl}&paid=test`,
        amount: order.totalCents / 100,
        currency: "EUR",
        audit: true,
        realPayment: false,
      });
    }

    const resolved = resolveOnlinePaymentProvider();
    if (!resolved.provider || !resolved.configured) {
      console.error("[payments] no online gateway", resolved.reason);
      throw new Error("PAYMENT_UNAVAILABLE");
    }

    const provider = resolved.provider;
    const testMode = resolved.testMode;

    if (provider === "viva") {
      if (!isVivaConfigured()) {
        if (!testMode) throw new Error("PAYMENT_UNAVAILABLE");
        const checkoutId = makeTestCheckoutId(order.id);
        await prisma.order.update({
          where: { id: orderId },
          data: { paymentProvider: "VIVA", vivaOrderCode: checkoutId },
        });
        return jsonResponse({
          checkoutId,
          redirectUrl: `${returnUrl}&paid=test`,
          amount: order.totalCents / 100,
          currency: "EUR",
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
        checkoutId: String(checkout.orderCode),
        redirectUrl: checkout.redirectUrl,
        amount: order.totalCents / 100,
        currency: "EUR",
      });
    }

    // SumUp online — uniquement si resolve l'a autorisé
    if (!isSumUpConfigured()) {
      if (!testMode) throw new Error("PAYMENT_UNAVAILABLE");
      const checkoutId = makeTestCheckoutId(order.id);
      await prisma.order.update({
        where: { id: orderId },
        data: { paymentProvider: "SUMUP", sumupCheckoutId: checkoutId },
      });
      return jsonResponse({
        checkoutId,
        redirectUrl: `${returnUrl}&paid=test`,
        amount: order.totalCents / 100,
        currency: "EUR",
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

    const payUrl = `${baseUrl}/checkout/pay?orderId=${encodeURIComponent(order.id)}&checkoutId=${encodeURIComponent(checkout.id)}`;

    return jsonResponse({
      checkoutId: checkout.id,
      redirectUrl: payUrl,
      amount: checkout.amount,
      currency: checkout.currency,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Statut technique — admin uniquement, ne pas exposer les noms au public */
export async function GET() {
  try {
    await requireAuth("ADMIN");
    const resolved = resolveOnlinePaymentProvider();
    return jsonResponse({
      onlineConfigured: resolved.configured,
      testMode: isPaymentTestMode(),
      providerInternal: resolved.provider,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
