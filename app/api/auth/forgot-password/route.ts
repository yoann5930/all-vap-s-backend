import { z } from "zod";
import prisma from "@/lib/prisma";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { getSiteUrl } from "@/lib/utils";
const schema = z.object({ email: z.string().email() });

export async function POST(request: Request) {
  try {
    const { email } = schema.parse(await request.json());
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    if (user) {
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 3600000);

      await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
      await prisma.passwordResetToken.create({
        data: { token, userId: user.id, expiresAt },
      });

      const baseUrl = getSiteUrl();
      console.log(`[All Vap's] Reset password link: ${baseUrl}/mot-de-passe-oublie?token=${token}`);
    }

    return jsonResponse({
      message: "Si cet email existe, un lien de réinitialisation a été envoyé.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
