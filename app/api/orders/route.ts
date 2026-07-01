import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getAuthUser } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { validateCoupon, calculateLoyaltyEarn } from "@/lib/loyalty";
import { getShippingPrice } from "@/lib/shipping";
import type { DeliveryMethod } from "@prisma/client";

const orderSchema = z.object({
  customerEmail: z.string().email(),
  customerName: z.string().optional(),
  shippingAddress: z.string().optional(),
  deliveryMethod: z.enum(["MONDIAL_RELAY", "RELAIS_COLIS", "COLISSIMO", "STORE_PICKUP"]),
  pickupStoreId: z.string().optional(),
  couponCode: z.string().optional(),
  paymentProvider: z.enum(["VIVA", "SUMUP"]).optional(),
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().int().positive(),
  })).min(1),
});

export async function GET() {
  try {
    const { requireAuth } = await import("@/lib/jwt");
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
    const body = await request.json();
    const data = orderSchema.parse(body);
    const auth = await getAuthUser();

    const productIds = data.items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true },
    });

    if (products.length !== productIds.length) throw new Error("NOT_FOUND");

    let subtotal = 0;
    for (const item of data.items) {
      const product = products.find((p) => p.id === item.productId)!;
      if (product.stock < item.quantity) {
        throw new Error(`Stock insuffisant pour ${product.name}`);
      }
      const price = product.isPromo && product.promoPriceCents ? product.promoPriceCents : product.priceCents;
      subtotal += price * item.quantity;
    }

    let discountCents = 0;
    if (data.couponCode) {
      const result = await validateCoupon(data.couponCode, subtotal);
      discountCents = result.discountCents;
    }

    const shippingCents = getShippingPrice(data.deliveryMethod as DeliveryMethod);
    const totalCents = Math.max(0, subtotal - discountCents + shippingCents);

    const order = await prisma.order.create({
      data: {
        userId: auth?.userId,
        customerEmail: data.customerEmail,
        customerName: data.customerName,
        shippingAddress: data.shippingAddress,
        deliveryMethod: data.deliveryMethod,
        pickupStoreId: data.pickupStoreId,
        couponCode: data.couponCode?.toUpperCase(),
        discountCents,
        paymentProvider: data.paymentProvider,
        totalCents,
        loyaltyPointsEarn: calculateLoyaltyEarn(totalCents),
        items: {
          create: data.items.map((item) => {
            const product = products.find((p) => p.id === item.productId)!;
            const price = product.isPromo && product.promoPriceCents ? product.promoPriceCents : product.priceCents;
            return { productId: item.productId, quantity: item.quantity, priceCents: price };
          }),
        },
      },
      include: { items: { include: { product: true } } },
    });

    if (data.couponCode) {
      await prisma.coupon.updateMany({
        where: { code: data.couponCode.toUpperCase() },
        data: { usedCount: { increment: 1 } },
      });
    }

    return jsonResponse(order, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
