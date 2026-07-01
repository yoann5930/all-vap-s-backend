import prisma from "@/lib/prisma";
import type { DiscountType } from "@prisma/client";

export async function validateCoupon(code: string, orderTotalCents: number) {
  const coupon = await prisma.coupon.findUnique({
    where: { code: code.toUpperCase() },
  });

  if (!coupon || !coupon.isActive) throw new Error("COUPON_INVALID");
  if (coupon.expiresAt && coupon.expiresAt < new Date()) throw new Error("COUPON_EXPIRED");
  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) throw new Error("COUPON_INVALID");
  if (orderTotalCents < coupon.minOrderCents) throw new Error("COUPON_INVALID");

  const discountCents =
    coupon.discountType === "PERCENT"
      ? Math.round((orderTotalCents * coupon.value) / 100)
      : coupon.value;

  return { coupon, discountCents: Math.min(discountCents, orderTotalCents) };
}

export function calculateLoyaltyEarn(totalCents: number): number {
  return Math.floor(totalCents / 100);
}

export function calculateLoyaltyDiscount(points: number): number {
  return points;
}

export type { DiscountType };
