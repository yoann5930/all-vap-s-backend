import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";
import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10).max(128),
});

/** Changement de mot de passe (obligatoire si mustChangePassword). */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth("ADMIN");
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const limited = checkRateLimit(`admin-pwd:${auth.userId}:${ip}`, 8, 60_000);
    if (!limited.ok) throw new Error("RATE_LIMITED");

    const body = changePasswordSchema.parse(await request.json());
    const user = await prisma.user.findUnique({ where: { id: auth.userId } });
    if (!user || user.role !== "ADMIN") throw new Error("FORBIDDEN");

    if (!(await verifyPassword(body.currentPassword, user.passwordHash))) {
      throw new Error("INVALID_CREDENTIALS");
    }

    const passwordHash = await hashPassword(body.newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false },
    });

    return jsonResponse({ ok: true, mustChangePassword: false });
  } catch (error) {
    return handleApiError(error);
  }
}

const setup2faSchema = z.object({
  action: z.enum(["setup", "enable", "disable", "status"]),
  token: z.string().optional(),
  password: z.string().optional(),
});

/** Gestion 2FA TOTP admin. */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth("ADMIN");
    const body = setup2faSchema.parse(await request.json());
    const user = await prisma.user.findUnique({ where: { id: auth.userId } });
    if (!user || user.role !== "ADMIN") throw new Error("FORBIDDEN");

    if (body.action === "status") {
      return jsonResponse({
        twoFactorEnabled: user.twoFactorEnabled,
        mustChangePassword: user.mustChangePassword,
        configured: !!user.totpSecret,
      });
    }

    if (body.action === "setup") {
      const secret = generateSecret();
      await prisma.user.update({
        where: { id: user.id },
        data: { totpSecret: secret, twoFactorEnabled: false },
      });
      const otpauth = generateURI({
        issuer: "All Vap's Admin",
        label: user.email,
        secret,
      });
      const qrImageUrl = await QRCode.toDataURL(otpauth);
      return jsonResponse({
        otpauth,
        qrImageUrl,
        secret,
        message:
          "Scannez le QR avec votre application d'authentification, puis validez (action enable + code).",
      });
    }

    if (body.action === "enable") {
      if (!user.totpSecret) throw new Error("2FA_NOT_SETUP");
      if (!body.token) throw new Error("2FA_INVALID");
      const check = await verifySync({ token: body.token, secret: user.totpSecret });
      if (!check.valid) throw new Error("2FA_INVALID");
      await prisma.user.update({
        where: { id: user.id },
        data: { twoFactorEnabled: true },
      });
      return jsonResponse({ ok: true, twoFactorEnabled: true });
    }

    if (body.action === "disable") {
      if (!body.password || !(await verifyPassword(body.password, user.passwordHash))) {
        throw new Error("INVALID_CREDENTIALS");
      }
      if (user.twoFactorEnabled && user.totpSecret) {
        if (!body.token) throw new Error("2FA_INVALID");
        const check = await verifySync({ token: body.token, secret: user.totpSecret });
        if (!check.valid) throw new Error("2FA_INVALID");
      }
      await prisma.user.update({
        where: { id: user.id },
        data: { twoFactorEnabled: false, totpSecret: null, totpBackupCodesHash: null },
      });
      return jsonResponse({ ok: true, twoFactorEnabled: false });
    }

    throw new Error("INVALID_STATUS_TRANSITION");
  } catch (error) {
    return handleApiError(error);
  }
}
