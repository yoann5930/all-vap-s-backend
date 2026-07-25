import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { sanitizeUser } from "@/lib/auth";

/** Liste tous les utilisateurs (admin). */
export async function GET() {
  try {
    await requireAuth("ADMIN");
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        emailVerified: true,
        loyaltyPoints: true,
        createdAt: true,
        _count: { select: { orders: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return jsonResponse(users);
  } catch (error) {
    return handleApiError(error);
  }
}

const patchSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["CUSTOMER", "ADMIN"]).optional(),
  firstName: z.string().max(80).optional().nullable(),
  lastName: z.string().max(80).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
});

/**
 * Mise à jour rôle / identité utilisateur (admin).
 * Garde-fous : un admin ne peut pas se retirer son propre rôle ADMIN.
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth("ADMIN");
    const data = patchSchema.parse(await request.json());

    if (data.role === "CUSTOMER" && data.userId === auth.userId) {
      return jsonResponse({ error: "Vous ne pouvez pas retirer votre propre rôle admin." }, 400);
    }

    if (data.role === "CUSTOMER") {
      const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
      const target = await prisma.user.findUnique({ where: { id: data.userId } });
      if (target?.role === "ADMIN" && adminCount <= 1) {
        return jsonResponse({ error: "Impossible de rétrograder le dernier administrateur." }, 400);
      }
    }

    const user = await prisma.user.update({
      where: { id: data.userId },
      data: {
        ...(data.role !== undefined ? { role: data.role } : {}),
        ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
        ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
      },
    });

    return jsonResponse({ user: sanitizeUser(user) });
  } catch (error) {
    return handleApiError(error);
  }
}
