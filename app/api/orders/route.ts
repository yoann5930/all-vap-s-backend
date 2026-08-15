import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth, getAuthUser } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { validateCoupon, calculateLoyaltyEarn } from "@/lib/loyalty";
import { getShippingPrice } from "@/lib/shipping";
import { generateSecureToken } from "@/lib/security";
import {
  calculatePromo10ml,
  type Promo10mlCartLine,
} from "@/lib/promotions/promo-10ml";
import {
  calculatePromoTwenty,
  type PromoTwentyCartLine,
} from "@/lib/promotions/promo-twenty";
import { resolveOnlinePaymentProvider } from "@/lib/payments/resolve-provider";
import type { DeliveryMethod } from "@prisma/client";
import {
  validateCartStock,
  reserveStockForOrder,
  releaseOrderReservations,
} from "@/lib/stock";
import { getAuditModeState, isAuditModeActive, verifyAuditSecret } from "@/lib/audit/mode";

const orderSchema = z.object({
  customerEmail: z.string().email().max(254).optional(),
  customerName: z.string().max(120).optional(),
  shippingAddress: z.string().max(500).optional(),
  deliveryMethod: z.enum(["MONDIAL_RELAY", "RELAIS_COLIS", "STORE_PICKUP"]),
  // COLISSIMO / La Poste : volontairement exclu du schéma public
  pickupStoreId: z.string().max(64).optional(),
  couponCode: z.string().max(40).optional(),
  /** Secret campagne — uniquement si mode AUDIT_ONLY actif côté serveur */
  auditSecret: z.string().max(200).optional(),
  items: z
    .array(
      z.object({
        productId: z.string(),
        variantId: z.string().optional().nullable(),
        quantity: z.number().int().positive().max(99),
      })
    )
    .min(1)
    .max(50),
});

export async function GET() {
  try {
    const auth = await requireAuth();
    const isAdmin = auth.role === "ADMIN";

    const orders = await prisma.order.findMany({
      where: isAdmin ? {} : { userId: auth.userId },
      include: {
        items: { include: { product: true } },
        user: { select: { email: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return jsonResponse(orders);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    // Compte client obligatoire — pas de commande invité
    const auth = await requireAuth();
    const body = await request.json();
    const data = orderSchema.parse(body);

    const user = await prisma.user.findUnique({ where: { id: auth.userId } });
    if (!user) throw new Error("UNAUTHORIZED");
    if (!user.emailVerified) throw new Error("EMAIL_NOT_VERIFIED");

    const productIds = data.items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true, visibleOnline: true },
      include: {
        variants: { where: { active: true } },
        rangeRef: { select: { slug: true, name: true } },
      },
    });

    if (products.length !== productIds.length) throw new Error("NOT_FOUND");

    let subtotal = 0;
    const promoLines: Promo10mlCartLine[] = [];
    const twentyLines: PromoTwentyCartLine[] = [];

    for (const item of data.items) {
      const product = products.find((p) => p.id === item.productId)!;
      const variant = item.variantId
        ? product.variants.find((v) => v.id === item.variantId)
        : null;
      // Le contrôle stock réel (StockLevel SumUp) est fait juste après via validateCartStock
      const price =
        variant?.priceCents && variant.priceCents > 0
          ? variant.priceCents
          : product.isPromo && product.promoPriceCents
            ? product.promoPriceCents
            : product.priceCents;
      subtotal += price * item.quantity;

      promoLines.push({
        productId: product.id,
        variantId: item.variantId,
        name: product.name,
        quantity: item.quantity,
        unitPriceCents: price,
        category: product.category,
        productType: product.productType,
        volumeMl: product.volumeMl,
        promotion10mlEligible: product.promotion10mlEligible,
        availableQuantity: variant?.stock ?? product.stock,
      });

      twentyLines.push({
        productId: product.id,
        variantId: item.variantId,
        name: product.name,
        quantity: item.quantity,
        unitPriceCents: price,
        category: product.category,
        productType: product.productType,
        volumeMl: product.volumeMl,
        brand: product.brand,
        range: product.rangeRef?.name ?? product.range,
        rangeSlug: product.rangeRef?.slug ?? null,
        productFamily: product.productFamily,
        availableQuantity: variant?.stock ?? product.stock,
      });
    }

    const auditActive = await isAuditModeActive();
    const auditState = await getAuditModeState();
    const providedSecret =
      data.auditSecret || request.headers.get("x-audit-secret") || "";
    const auditSecretOk =
      auditActive && (await verifyAuditSecret(providedSecret));
    // Hors-stock réservé au flag allowOutOfStock — ne conditionne PAS isAudit.
    const allowOosAudit = auditSecretOk && auditState.allowOutOfStock === true;

    const promo10 = calculatePromo10ml(promoLines);
    const promoTwenty = calculatePromoTwenty(twentyLines);

    const extras = [...promoTwenty.extras, ...promo10.extras];
    const stockLines = data.items.map((i) => ({
      productId: i.productId,
      variantId: i.variantId,
      quantity: i.quantity,
    }));
    for (const extra of extras) {
      const hit = stockLines.find(
        (l) =>
          l.productId === extra.productId &&
          (l.variantId || null) === (extra.variantId || null)
      );
      if (hit) hit.quantity += extra.quantity;
      else {
        stockLines.push({
          productId: extra.productId,
          variantId: extra.variantId,
          quantity: extra.quantity,
        });
      }
    }

    const stockCheck = await validateCartStock(stockLines, {
      allowOutOfStockAudit: allowOosAudit,
    });
    if (!stockCheck.ok) {
      return jsonResponse(
        {
          error: stockCheck.message,
          code: stockCheck.code || "STOCK_INSUFFICIENT",
          lines: stockCheck.lines,
        },
        409
      );
    }

    const anyInsufficient = stockCheck.lines.some((l) => l.available < l.requested);
    const isAuditOrder = auditSecretOk;
    const auditAllowOutOfStock = allowOosAudit && anyInsufficient;

    let discountCents = promo10.discountCents + promoTwenty.discountCents;
    if (data.couponCode) {
      const result = await validateCoupon(
        data.couponCode,
        Math.max(0, subtotal - discountCents)
      );
      discountCents += result.discountCents;
    }

    const shippingCents = getShippingPrice(data.deliveryMethod as DeliveryMethod);
    const totalCents = Math.max(0, subtotal - discountCents + shippingCents);
    const checkoutToken = generateSecureToken(24);

    const gateway = resolveOnlinePaymentProvider();
    const paymentProvider =
      gateway.provider === "viva" ? "VIVA" : gateway.provider === "sumup" ? "SUMUP" : undefined;

    const customerName =
      data.customerName ||
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      undefined;

    const order = await prisma.order.create({
      data: {
        userId: auth.userId,
        customerEmail: user.email,
        customerName,
        shippingAddress: data.shippingAddress,
        deliveryMethod: data.deliveryMethod,
        pickupStoreId: data.pickupStoreId,
        couponCode: data.couponCode?.toUpperCase(),
        discountCents,
        shippingCents,
        checkoutToken,
        paymentProvider,
        totalCents,
        loyaltyPointsEarn: isAuditOrder ? 0 : calculateLoyaltyEarn(totalCents),
        isAudit: isAuditOrder,
        auditCampaignId: isAuditOrder ? auditState.campaignId : null,
        auditAllowOutOfStock,
        items: {
          create: [
            ...data.items.map((item) => {
            const product = products.find((p) => p.id === item.productId)!;
            const variant = item.variantId
              ? product.variants.find((v) => v.id === item.variantId)
              : null;
            const price =
              variant?.priceCents && variant.priceCents > 0
                ? variant.priceCents
                : product.isPromo && product.promoPriceCents
                  ? product.promoPriceCents
                  : product.priceCents;
            return {
              productId: item.productId,
              quantity: item.quantity,
              priceCents: price,
            };
          }),
            ...extras.map((extra) => ({
              productId: extra.productId,
              quantity: extra.quantity,
              priceCents: 0,
            })),
          ],
        },
      },
      include: { items: { include: { product: true } } },
    });

    try {
      const { recordInitialOrderStatus } = await import("@/lib/orders/workflow");
      await recordInitialOrderStatus(order.id);
    } catch {
      console.error("[orders] status history create failed");
    }

    if (!auditAllowOutOfStock) {
      const reserved = await reserveStockForOrder({
        orderId: order.id,
        lines: stockLines,
      });
      if (!reserved.ok) {
        await prisma.order.update({
          where: { id: order.id },
          data: { status: "CANCELLED" },
        });
        await releaseOrderReservations(order.id);
        return jsonResponse(
          {
            error: reserved.message,
            code: reserved.code || "STOCK_INSUFFICIENT",
          },
          409
        );
      }
    }

    return jsonResponse(
      {
        ...order,
        checkoutToken,
        audit: isAuditOrder
          ? {
              campaignId: auditState.campaignId,
              allowOutOfStock: auditAllowOutOfStock,
              excludedFromProductionStats: true,
            }
          : undefined,
        promo10ml: {
          eligibleQuantity: promo10.eligibleQuantity,
          unitCents: promo10.unitCents,
          freeExtra: promo10.freeExtra,
          freeQuantity: promo10.freeQuantity,
          payCents: promo10.payCents,
          discountCents: promo10.discountCents,
          label: promo10.label,
          avaSummary: promo10.avaSummary,
        },
        promoTwenty: {
          eligibleQuantity: promoTwenty.eligibleQuantity,
          unitCents: promoTwenty.unitCents,
          freeExtra: promoTwenty.freeExtra,
          payCents: promoTwenty.payCents,
          discountCents: promoTwenty.discountCents,
          label: promoTwenty.label,
          avaSummary: promoTwenty.avaSummary,
        },
      },
      201
    );
  } catch (error) {
    return handleApiError(error);
  }
}
