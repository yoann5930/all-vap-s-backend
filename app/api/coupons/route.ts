import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { validateCoupon } from "@/lib/loyalty";

const schema = z.object({
  code: z.string(),
  orderTotalCents: z.number().int().positive(),
});

export async function POST(request: NextRequest) {
  try {
    const data = schema.parse(await request.json());
    const result = await validateCoupon(data.code, data.orderTotalCents);
    return jsonResponse({
      code: result.coupon.code,
      discountCents: result.discountCents,
      description: result.coupon.description,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET() {
  try {
    await requireAuth("ADMIN");
    const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } });
    return jsonResponse(coupons);
  } catch (error) {
    return handleApiError(error);
  }
}
