import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import prisma from "@/lib/prisma";
import { isDemoMode } from "@/lib/demo";

/** Fixture de test — uniquement en DEMO_MODE. */
export async function POST(request: NextRequest) {
  try {
    if (!isDemoMode()) {
      return jsonResponse({ error: "Disponible uniquement en DEMO_MODE" }, 404);
    }
    await requireAuth("ADMIN");
    const body = z
      .object({
        productId: z.string(),
        priceCents: z.number().int().min(0),
      })
      .parse(await request.json());

    const product = await prisma.product.update({
      where: { id: body.productId },
      data: {
        priceCents: body.priceCents,
        promoPriceCents: body.priceCents > 0 ? undefined : null,
      },
      select: { id: true, barcode: true, priceCents: true, name: true },
    });
    return jsonResponse({ product });
  } catch (error) {
    return handleApiError(error);
  }
}
