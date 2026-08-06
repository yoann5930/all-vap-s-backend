import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireStaff } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { prepareParcel, updateOrderShippingStatus } from "@/lib/shipping/ops";
import type { OrderStatus } from "@prisma/client";

export async function GET() {
  try {
    await requireStaff();
    const orders = await prisma.order.findMany({
      include: {
        items: { include: { product: { select: { id: true, name: true } } } },
        user: { select: { email: true, firstName: true, lastName: true } },
        statusHistory: { orderBy: { createdAt: "desc" }, take: 20 },
        documents: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    });
    return jsonResponse(orders);
  } catch (error) {
    return handleApiError(error);
  }
}

const patchSchema = z.object({
  orderId: z.string(),
  action: z
    .enum([
      "prepare",
      "mark_prepared",
      "ship",
      "at_relay",
      "deliver",
      "cancel",
    ])
    .optional(),
  status: z
    .enum([
      "PREPARING",
      "PREPARED",
      "SHIPPED",
      "AT_RELAY",
      "DELIVERED",
      "CANCELLED",
    ])
    .optional(),
  trackingNumber: z.string().min(4).max(80).optional(),
  note: z.string().max(500).optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireStaff();
    const body = patchSchema.parse(await request.json());
    const { orderId } = body;

    const action =
      body.action ||
      (body.status === "SHIPPED"
        ? "ship"
        : body.status === "DELIVERED"
          ? "deliver"
          : body.status === "CANCELLED"
            ? "cancel"
            : body.status === "PREPARING"
              ? "prepare"
              : body.status === "PREPARED"
                ? "mark_prepared"
                : body.status === "AT_RELAY"
                  ? "at_relay"
                  : null);

    if (!action) throw new Error("INVALID_STATUS_TRANSITION");

    if (action === "prepare") {
      const prepared = await prepareParcel(orderId, {
        trackingNumber: body.trackingNumber,
        changedById: auth.userId,
      });
      return jsonResponse(prepared);
    }

    const statusMap: Record<string, OrderStatus> = {
      mark_prepared: "PREPARED",
      ship: "SHIPPED",
      at_relay: "AT_RELAY",
      deliver: "DELIVERED",
      cancel: "CANCELLED",
    };

    const next = statusMap[action];
    if (!next) throw new Error("INVALID_STATUS_TRANSITION");

    const result = await updateOrderShippingStatus(orderId, next, {
      trackingNumber: body.trackingNumber,
      changedById: auth.userId,
      note: body.note,
    });
    return jsonResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}
