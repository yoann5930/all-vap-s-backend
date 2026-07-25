import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { sanitizeUser } from "@/lib/auth";

export async function GET() {
  try {
    const auth = await requireAuth();
    const user = await prisma.user.findUnique({ where: { id: auth.userId } });
    if (!user) throw new Error("NOT_FOUND");
    return jsonResponse({ user: sanitizeUser(user) });
  } catch (error) {
    return handleApiError(error);
  }
}

const patchSchema = z.object({
  firstName: z.string().max(80).optional().nullable(),
  lastName: z.string().max(80).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
});

/** Mise à jour du profil identité (prénom, nom, téléphone). */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth();
    const data = patchSchema.parse(await request.json());

    const user = await prisma.user.update({
      where: { id: auth.userId },
      data: {
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
