import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { updateOrderShippingStatus } from "@/lib/shipping/ops";

export async function GET() {
  try {
    await requireAuth("ADMIN");
    const customers = await prisma.user.findMany({
      where: { role: "CUSTOMER" },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        loyaltyPoints: true,
        createdAt: true,
        _count: { select: { orders: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return jsonResponse(customers);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * @deprecated Préférer PATCH /api/admin/orders.
 * Conservé pour compatibilité (ship / deliver / cancel uniquement).
 */
export async function PATCH(request: NextRequest) {
  try {
    await requireAuth("ADMIN");
    const { orderId, status } = z
      .object({
        orderId: z.string(),
        status: z.enum(["SHIPPED", "DELIVERED", "CANCELLED"]),
      })
      .parse(await request.json());

    const result = await updateOrderShippingStatus(orderId, status);
    return jsonResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}
