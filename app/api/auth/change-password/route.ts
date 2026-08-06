import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { hashPassword, verifyPassword, sanitizeUser } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { assertSameOrigin } from "@/lib/security";
import { writeAuditLog } from "@/lib/audit/log";
import { clientIp } from "@/lib/rate-limit";

const schema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Za-z]/, "lettre requise")
    .regex(/[0-9]/, "chiffre requis"),
});

/** Changement de mot de passe (1ère connexion ou volontaire). */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth();
    const body = schema.parse(await request.json());

    const user = await prisma.user.findUnique({ where: { id: auth.userId } });
    if (!user || !user.active) throw new Error("ACCOUNT_DISABLED");

    if (!(await verifyPassword(body.currentPassword, user.passwordHash))) {
      throw new Error("INVALID_CREDENTIALS");
    }
    if (body.currentPassword === body.newPassword) {
      throw new Error("SAME_PASSWORD");
    }

    const passwordHash = await hashPassword(body.newPassword);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
      },
    });

    await writeAuditLog({
      user: auth,
      action: "PASSWORD_CHANGED",
      ip: clientIp(request),
      metadata: { forced: user.mustChangePassword },
    });

    return jsonResponse({ user: sanitizeUser(updated), ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
