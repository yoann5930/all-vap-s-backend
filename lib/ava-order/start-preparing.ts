import prisma from "@/lib/prisma";
import { verifyPrepActionToken } from "@/lib/ava-order/prep-action";
import { recordAvaOrderEvent } from "@/lib/ava-order/audit-trail";
import { transitionOrderStatus } from "@/lib/orders/workflow";

const ALREADY = new Set(["PREPARING", "PREPARED", "SHIPPED", "AT_RELAY", "DELIVERED"]);

export async function startPreparingOrder(
  orderId: string,
  options: { changedById?: string | null; actor?: string } = {},
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false as const, error: "NOT_FOUND" };

  if (ALREADY.has(order.status)) {
    return {
      ok: true as const,
      already: true,
      orderId: order.id,
      status: order.status,
    };
  }

  if (order.status !== "PAID") {
    return { ok: false as const, error: "WRONG_STATUS", status: order.status };
  }

  const updated = await transitionOrderStatus(orderId, "PREPARING", {
    changedById: options.changedById,
    actor: options.actor || "preparer",
    note: "PREPARATION_STARTED",
    metadata: { event: "PREPARATION_STARTED" },
  });

  console.log(`[ORDER] Preparation started order=${orderId}`);
  await recordAvaOrderEvent(order.id, "PREPARING_STARTED", {
    deliveryMethod: order.deliveryMethod,
    actor: options.actor || "preparer",
  });

  return {
    ok: true as const,
    already: false,
    orderId: updated.id,
    status: updated.status,
  };
}

export async function startPreparingFromSecureToken(token: string) {
  const verified = await verifyPrepActionToken(token, "start_preparing");
  if (!verified.ok) {
    return { ok: false as const, error: verified.error };
  }
  return startPreparingOrder(verified.orderId, { actor: "preparer_token" });
}
