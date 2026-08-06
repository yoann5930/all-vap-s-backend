import { z } from "zod";
import prisma from "@/lib/prisma";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { getSiteUrl } from "@/lib/utils";
import { sendPasswordResetEmail } from "@/lib/email";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/security";

const schema = z.object({ email: z.string().email().max(254) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const ip = clientIp(request);
    const limit = checkRateLimit(`forgot:ip:${ip}`, 8, 15 * 60 * 1000);
    if (!limit.ok) {
      return jsonResponse(
        { error: "Trop de tentatives. Réessayez plus tard.", retryAfterSec: limit.retryAfterSec },
        429
      );
    }

    const { email } = schema.parse(await request.json());
    const emailLimit = checkRateLimit(`forgot:email:${email.toLowerCase()}`, 3, 15 * 60 * 1000);
    if (!emailLimit.ok) {
      return jsonResponse(
        { error: "Trop de tentatives. Réessayez plus tard.", retryAfterSec: emailLimit.retryAfterSec },
        429
      );
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    if (user) {
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 3600000);

      await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
      await prisma.passwordResetToken.create({
        data: { token, userId: user.id, expiresAt },
      });

      const baseUrl = getSiteUrl();
      const resetUrl = `${baseUrl}/mot-de-passe-oublie?token=${token}`;
      await sendPasswordResetEmail({ to: user.email, resetUrl });
    }

    return jsonResponse({
      message: "Si un compte correspond à cette adresse, un e-mail de réinitialisation a été envoyé.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
