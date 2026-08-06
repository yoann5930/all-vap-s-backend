import { z } from "zod";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { sendPasswordChangedEmail } from "@/lib/email";

const schema = z.object({
  token: z.string(),
  password: z.string().min(8),
});

export async function POST(request: Request) {
  try {
    const { token, password } = schema.parse(await request.json());

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetToken || resetToken.expiresAt < new Date()) {
      throw new Error("INVALID_TOKEN");
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = resetToken.user;

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.delete({ where: { id: resetToken.id } }),
    ]);

    try {
      await sendPasswordChangedEmail({
        to: user.email,
        firstName: user.firstName,
        customerId: user.id,
      });
    } catch {
      console.error("[auth] password-changed email failed");
    }

    return jsonResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
