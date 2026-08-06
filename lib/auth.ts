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
import { sendAccountConfirmationEmail } from "@/lib/email";
import { getSiteUrl } from "@/lib/utils";
import type { Role } from "@prisma/client";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  if (!password || !hash || typeof hash !== "string" || hash.length < 20) {
    return false;
  }
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    // Hash corrompu / non-bcrypt → traité comme identifiants invalides (pas 500)
    return false;
  }
}

export async function registerUser(data: {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
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
    await sendAccountConfirmationEmail({
      to: user.email,
      confirmUrl,
      firstName: user.firstName,
    });
  } catch (err) {
    console.error("[auth] confirmation email failed:", err);
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

export async function loginUser(email: string, password: string) {
  let user: Awaited<ReturnType<typeof prisma.user.findUnique>>;
  try {
    user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
  } catch (err) {
    console.error("[auth] login DB error (migrations User / Role ?):", err);
    throw new Error("AUTH_DB_UNAVAILABLE");
  }

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new Error("INVALID_CREDENTIALS");
  }

  if (user.active === false) {
    throw new Error("ACCOUNT_DISABLED");
  }

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
  } catch (err) {
    // Ne bloque pas la connexion si lastLoginAt/colonnes inventaire absentes
    console.error("[auth] lastLoginAt update failed:", err);
  }

  const payload: JwtPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };

  const token = await signToken(payload);
  await setAuthCookie(token);
  await issueRefreshToken(user.id);

  return { user: sanitizeUser(user), token };
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
  active?: boolean;
  mustChangePassword?: boolean;
  allowedStores?: string[];
  lastLoginAt?: Date | null;
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone ?? null,
    role: user.role,
    emailVerified: user.emailVerified ?? true,
    active: user.active ?? true,
    mustChangePassword: user.mustChangePassword ?? false,
    allowedStores: user.allowedStores ?? [],
    lastLoginAt: user.lastLoginAt ?? null,
    createdAt: user.createdAt,
  };
}

export { sanitizeUser };
