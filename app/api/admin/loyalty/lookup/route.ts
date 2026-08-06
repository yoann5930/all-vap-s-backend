import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { getFideleAToutPublicStatus } from "@/lib/fidele-a-tout";

const schema = z.object({
  phone: z.string().min(6).optional(),
  code: z.string().min(4).optional(),
});

/** Recherche client fidélité (téléphone ou QR) — admin boutique. */
export async function POST(request: NextRequest) {
  try {
    await requireAuth("ADMIN");
    const body = schema.parse(await request.json());
    if (!body.phone && !body.code) {
      return jsonResponse({ error: "phone ou code requis" }, 400);
    }

    const where = body.phone
      ? {
          phone: { contains: body.phone.replace(/\s+/g, "").slice(-9) },
          role: "CUSTOMER" as const,
        }
      : {
          OR: [
            { qrCode: body.code! },
            { fideleAToutBarcode: body.code! },
            { fideleAToutMemberId: body.code! },
          ],
          role: "CUSTOMER" as const,
        };

    const customers = await prisma.user.findMany({
      where,
      take: 20,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        loyaltyPoints: true,
        qrCode: true,
        fideleAToutMemberId: true,
        fideleAToutBarcode: true,
        fideleAToutSyncStatus: true,
        loyaltyLedger: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            delta: true,
            balanceAfter: true,
            reason: true,
            source: true,
            createdAt: true,
          },
        },
      },
    });

    return jsonResponse({
      customers,
      fideleATout: getFideleAToutPublicStatus(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
