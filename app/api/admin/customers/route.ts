import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";

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

export async function PATCH(request: NextRequest) {
  try {
    await requireAuth("ADMIN");
    const { orderId, status } = z.object({
      orderId: z.string(),
      status: z.enum(["PENDING", "PAID", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"]),
    }).parse(await request.json());

    const order = await prisma.order.update({
      where: { id: orderId },
      data: { status },
    });

    return jsonResponse(order);
  } catch (error) {
    return handleApiError(error);
  }
}
