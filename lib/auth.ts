import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import {
  signToken,
  setAuthCookie,
  issueRefreshToken,
  revokeRefreshToken,
  clearAuthCookie,
  type JwtPayload,
} from "@/lib/jwt";
import {
  sendAccountConfirmationEmail,
  sendAccountCreatedEmail,
  sendAdminNewRegistrationEmail,
} from "@/lib/email";
import { getSiteUrl } from "@/lib/utils";
import type { Role } from "@prisma/client";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function registerUser(data: {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}) {
  const existing = await prisma.user.findUnique({
    where: { email: data.email.toLowerCase() },
  });

  if (existing) {
    throw new Error("EMAIL_EXISTS");
  }

  const passwordHash = await hashPassword(data.password);

  const user = await prisma.user.create({
    data: {
      email: data.email.toLowerCase(),
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone || null,
      emailVerified: false,
    },
  });

  const confirmToken = crypto.randomUUID();
  await prisma.emailConfirmationToken.create({
    data: {
      token: confirmToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
    },
  });

  const confirmUrl = `${getSiteUrl()}/confirmer-compte?token=${confirmToken}`;
  try {
    await sendAccountCreatedEmail({
      to: user.email,
      firstName: user.firstName,
      customerId: user.id,
    });
  } catch {
    console.error("[auth] welcome email failed");
  }
  try {
    await sendAccountConfirmationEmail({
      to: user.email,
      confirmUrl,
      firstName: user.firstName,
      customerId: user.id,
    });
  } catch {
    console.error("[auth] confirmation email failed");
  }
  try {
    await sendAdminNewRegistrationEmail({
      email: user.email,
      firstName: user.firstName,
      customerId: user.id,
    });
  } catch {
    console.error("[auth] admin registration email failed");
  }

  const payload: JwtPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };

  // Session immédiate conservée (ne casse pas le parcours login post-inscription).
  // emailVerified reste false jusqu'au clic sur le lien.
  const token = await signToken(payload);
  await setAuthCookie(token);
  await issueRefreshToken(user.id);

  return {
    user: sanitizeUser(user),
    token,
    emailConfirmationSent: true,
  };
}

export async function confirmUserEmail(token: string) {
  const record = await prisma.emailConfirmationToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!record || record.expiresAt < new Date()) {
    throw new Error("INVALID_TOKEN");
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { emailVerified: true },
    }),
    prisma.emailConfirmationToken.deleteMany({ where: { userId: record.userId } }),
  ]);

  return sanitizeUser({
    ...record.user,
    emailVerified: true,
  });
}

export async function loginUser(
  email: string,
  password: string,
  options?: { totpToken?: string }
) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new Error("INVALID_CREDENTIALS");
  }

  if (user.role === "ADMIN" && user.twoFactorEnabled && user.totpSecret) {
    if (!options?.totpToken) {
      throw new Error("2FA_REQUIRED");
    }
    const { verifySync } = await import("otplib");
    const check = await verifySync({ token: options.totpToken, secret: user.totpSecret });
    if (!check.valid) throw new Error("2FA_INVALID");
  }

  const payload: JwtPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };

  const token = await signToken(payload);
  await setAuthCookie(token);
  await issueRefreshToken(user.id);

  return {
    user: sanitizeUser(user),
    token,
    emailVerified: user.emailVerified,
    mustChangePassword: user.mustChangePassword,
    twoFactorEnabled: user.twoFactorEnabled,
  };
}

export async function logoutUser() {
  await revokeRefreshToken();
  await clearAuthCookie();
}

function sanitizeUser(user: {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone?: string | null;
  role: Role;
  emailVerified?: boolean;
  mustChangePassword?: boolean;
  twoFactorEnabled?: boolean;
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone ?? null,
    role: user.role,
    emailVerified: user.emailVerified ?? false,
    mustChangePassword: user.mustChangePassword ?? false,
    twoFactorEnabled: user.twoFactorEnabled ?? false,
    createdAt: user.createdAt,
  };
}

export { sanitizeUser };
