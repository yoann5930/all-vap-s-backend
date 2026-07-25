import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { prepareParcel, updateOrderShippingStatus } from "@/lib/shipping/ops";

/** Liste admin des commandes. */
export async function GET() {
  try {
    await requireAuth("ADMIN");
    const orders = await prisma.order.findMany({
      include: {
        items: { include: { product: { select: { id: true, name: true } } } },
        user: { select: { email: true, firstName: true, lastName: true } },
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
  action: z.enum(["prepare", "ship", "deliver", "cancel"]).optional(),
  status: z.enum(["SHIPPED", "DELIVERED", "CANCELLED"]).optional(),
});

/**
 * Actions livraison admin :
 * - prepare : génère le n° de suivi
 * - ship / status=SHIPPED : PAID → SHIPPED (+ email)
 * - deliver / status=DELIVERED : SHIPPED → DELIVERED (+ email)
 * - cancel / status=CANCELLED : PENDING|PAID → CANCELLED
 */
export async function PATCH(request: NextRequest) {
  try {
    await requireAuth("ADMIN");
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
            : null);

    if (!action) throw new Error("INVALID_STATUS_TRANSITION");

    if (action === "prepare") {
      const prepared = await prepareParcel(orderId);
      return jsonResponse(prepared);
    }

    const statusMap = {
      ship: "SHIPPED",
      deliver: "DELIVERED",
      cancel: "CANCELLED",
    } as const;

    const result = await updateOrderShippingStatus(orderId, statusMap[action]);
    return jsonResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}
