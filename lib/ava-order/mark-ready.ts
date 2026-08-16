import prisma from "@/lib/prisma";
import { verifyPrepActionToken } from "@/lib/ava-order/prep-action";
import { recordAvaOrderEvent } from "@/lib/ava-order/audit-trail";
import { transitionOrderStatus } from "@/lib/orders/workflow";

const ALREADY_READY = new Set(["PREPARED", "SHIPPED", "AT_RELAY", "DELIVERED"]);

export async function markOrderReady(
  orderId: string,
  options: { changedById?: string | null; actor?: string } = {},
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false as const, error: "NOT_FOUND" };

  if (ALREADY_READY.has(order.status)) {
    return {
      ok: true as const,
      already: true,
      orderId: order.id,
      status: order.status,
    };
  }

  if (order.status !== "PREPARING") {
    return { ok: false as const, error: "WRONG_STATUS", status: order.status };
  }

  const updated = await transitionOrderStatus(orderId, "PREPARED", {
    changedById: options.changedById,
    actor: options.actor || "preparer",
    note: "ORDER_READY",
    metadata: { event: "ORDER_READY" },
  });

  console.log(`[ORDER] Order ready order=${orderId}`);
  await recordAvaOrderEvent(order.id, "ORDER_READY", {
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

export async function markOrderReadyFromSecureToken(token: string) {
  const verified = await verifyPrepActionToken(token, "mark_ready");
  if (!verified.ok) {
    return { ok: false as const, error: verified.error };
  }
  return markOrderReady(verified.orderId, { actor: "preparer_token" });
}
