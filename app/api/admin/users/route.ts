import { NextRequest } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { hashPassword, sanitizeUser } from "@/lib/auth";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { assertSameOrigin } from "@/lib/security";
import { writeAuditLog } from "@/lib/audit/log";
import { clientIp } from "@/lib/rate-limit";
import {
  HAUTMONT_STOCK_CODE,
  LE_QUESNOY_STOCK_CODE,
} from "@/lib/catalog/normalize";

const storeEnum = z.enum([HAUTMONT_STOCK_CODE, LE_QUESNOY_STOCK_CODE]);

function tempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$";
  const bytes = randomBytes(14);
  let out = "";
  for (let i = 0; i < 14; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

/** Liste utilisateurs (admin) — inventaire + rôles. */
export async function GET() {
  try {
    await requireAuth("ADMIN");
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { role: "ADMIN" },
          { role: "EMPLOYEE" },
          { role: "CUSTOMER" },
        ],
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        active: true,
        mustChangePassword: true,
        allowedStores: true,
        lastLoginAt: true,
        emailVerified: true,
        createdAt: true,
        _count: { select: { orders: true, inventorySessions: true } },
      },
      orderBy: [{ role: "asc" }, { lastName: "asc" }],
    });
    return jsonResponse({ users });
  } catch (error) {
    return handleApiError(error);
  }
}

const createSchema = z.object({
  email: z.string().email().max(254),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  role: z.enum(["EMPLOYEE", "ADMIN", "CUSTOMER"]),
  allowedStores: z.array(storeEnum).default([]),
  phone: z.string().max(30).optional().nullable(),
});

/** Création utilisateur + mot de passe temporaire (retourné une seule fois). */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth("ADMIN");
    const data = createSchema.parse(await request.json());

    const existing = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });
    if (existing) throw new Error("EMAIL_EXISTS");

    const plain = tempPassword();
    const passwordHash = await hashPassword(plain);
    const user = await prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone || null,
        role: data.role,
        allowedStores: data.role === "CUSTOMER" ? [] : data.allowedStores,
        active: true,
        mustChangePassword: true,
        passwordHash,
        emailVerified: true,
      },
    });

    await writeAuditLog({
      user: auth,
      action: "USER_CREATED",
      ip: clientIp(request),
      metadata: { targetUserId: user.id, targetEmail: user.email, role: user.role },
    });

    return jsonResponse(
      {
        user: sanitizeUser(user),
        temporaryPassword: plain,
      },
      201
    );
  } catch (error) {
    return handleApiError(error);
  }
}

const patchSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["CUSTOMER", "EMPLOYEE", "ADMIN"]).optional(),
  firstName: z.string().max(80).optional().nullable(),
  lastName: z.string().max(80).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  active: z.boolean().optional(),
  allowedStores: z.array(storeEnum).optional(),
  resetPassword: z.boolean().optional(),
});

/**
 * Mise à jour / désactivation / reset MDP (admin).
 * Le mot de passe temporaire n'est renvoyé que si resetPassword=true.
 */
export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth("ADMIN");
    const data = patchSchema.parse(await request.json());

    const target = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!target) throw new Error("NOT_FOUND");

    if (data.role && data.role !== "ADMIN" && data.userId === auth.userId) {
      return jsonResponse(
        { error: "Vous ne pouvez pas retirer votre propre rôle admin." },
        400
      );
    }

    if (data.role && data.role !== "ADMIN" && target.role === "ADMIN") {
      const adminCount = await prisma.user.count({
        where: { role: "ADMIN", active: true },
      });
      if (adminCount <= 1) {
        return jsonResponse(
          { error: "Impossible de rétrograder le dernier administrateur." },
          400
        );
      }
    }

    if (data.active === false && data.userId === auth.userId) {
      return jsonResponse({ error: "Vous ne pouvez pas vous désactiver vous-même." }, 400);
    }

    let temporaryPassword: string | undefined;
    let passwordHash: string | undefined;
    if (data.resetPassword) {
      temporaryPassword = tempPassword();
      passwordHash = await hashPassword(temporaryPassword);
    }

    const user = await prisma.user.update({
      where: { id: data.userId },
      data: {
        ...(data.role !== undefined ? { role: data.role } : {}),
        ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
        ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
        ...(data.allowedStores !== undefined
          ? { allowedStores: data.allowedStores }
          : {}),
        ...(passwordHash
          ? { passwordHash, mustChangePassword: true }
          : {}),
      },
    });

    await writeAuditLog({
      user: auth,
      action: data.resetPassword
        ? "USER_PASSWORD_RESET"
        : data.active === false
          ? "USER_DISABLED"
          : data.active === true
            ? "USER_ENABLED"
            : "USER_UPDATED",
      ip: clientIp(request),
      metadata: {
        targetUserId: user.id,
        targetEmail: user.email,
        role: user.role,
        active: user.active,
      },
    });

    return jsonResponse({
      user: sanitizeUser(user),
      ...(temporaryPassword ? { temporaryPassword } : {}),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
