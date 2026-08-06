import prisma from "@/lib/prisma";
import { mayAwardLocalLoyaltyPoints } from "@/lib/fidele-a-tout";

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

/** 1 € dépensé = 1 point (arrondi inférieur). */
export function calculateLoyaltyEarn(totalCents: number): number {
  return Math.floor(totalCents / 100);
}

/**
 * Conversion points → réduction (centimes).
 * Non appliquée tant que le parcours de rachat n'est pas branché / Fidèle à Tout.
 */
export function calculateLoyaltyDiscount(points: number): number {
  return points;
}

export type LoyaltyLedgerReason =
  | "order_earn"
  | "order_refund"
  | "admin_adjust"
  | "fidele_sync"
  | "fidele_pending"
  | "redeem";

/**
 * Crédite des points + écriture ledger.
 * Si Fidèle à Tout impose la sync : n'écrit qu'une entrée pending (pas de solde local).
 */
export async function awardLoyaltyPoints(params: {
  userId: string;
  points: number;
  reason: LoyaltyLedgerReason;
  orderId?: string;
  externalRef?: string;
  source?: "local" | "fidele_a_tout" | "pending_fidele";
}) {
  if (params.points === 0) return { awarded: 0, balance: null as number | null, pending: false };

  if (!mayAwardLocalLoyaltyPoints()) {
    await prisma.loyaltyLedgerEntry.create({
      data: {
        userId: params.userId,
        delta: params.points,
        balanceAfter: 0,
        reason: "fidele_pending",
        source: "pending_fidele",
        orderId: params.orderId,
        externalRef: params.externalRef,
        meta: { note: "En attente de synchronisation Fidèle à Tout" },
      },
    });
    return { awarded: 0, balance: null, pending: true };
  }

  const user = await prisma.user.update({
    where: { id: params.userId },
    data: { loyaltyPoints: { increment: params.points } },
    select: { loyaltyPoints: true },
  });

  await prisma.loyaltyLedgerEntry.create({
    data: {
      userId: params.userId,
      delta: params.points,
      balanceAfter: user.loyaltyPoints,
      reason: params.reason,
      source: params.source || "local",
      orderId: params.orderId,
      externalRef: params.externalRef,
    },
  });

  return { awarded: params.points, balance: user.loyaltyPoints, pending: false };
}

export async function revokeLoyaltyPoints(params: {
  userId: string;
  points: number;
  reason: LoyaltyLedgerReason;
  orderId?: string;
  externalRef?: string;
}) {
  if (params.points === 0) return;
  if (!mayAwardLocalLoyaltyPoints()) {
    await prisma.loyaltyLedgerEntry.create({
      data: {
        userId: params.userId,
        delta: -params.points,
        balanceAfter: 0,
        reason: "fidele_pending",
        source: "pending_fidele",
        orderId: params.orderId,
        externalRef: params.externalRef,
        meta: { note: "Annulation en attente Fidèle à Tout" },
      },
    });
    return;
  }

  const user = await prisma.user.update({
    where: { id: params.userId },
    data: { loyaltyPoints: { decrement: params.points } },
    select: { loyaltyPoints: true },
  });

  await prisma.loyaltyLedgerEntry.create({
    data: {
      userId: params.userId,
      delta: -params.points,
      balanceAfter: Math.max(0, user.loyaltyPoints),
      reason: params.reason,
      source: "local",
      orderId: params.orderId,
      externalRef: params.externalRef,
    },
  });
}

export type { DiscountType } from "@prisma/client";
