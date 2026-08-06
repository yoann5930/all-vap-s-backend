import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { hashPassword, sanitizeUser } from "@/lib/auth";
import { generateTempAccessCode } from "@/lib/admin/temp-access-code";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { assertSameOrigin } from "@/lib/security";
import { writeAuditLog } from "@/lib/audit/log";
import { clientIp } from "@/lib/rate-limit";
import {
  HAUTMONT_STOCK_CODE,
  LE_QUESNOY_STOCK_CODE,
} from "@/lib/catalog/normalize";

const storeEnum = z.enum([HAUTMONT_STOCK_CODE, LE_QUESNOY_STOCK_CODE]);

/** Liste comptes inventaire (EMPLOYEE + ADMIN). Pas de passwordHash. */
export async function GET(request: NextRequest) {
  try {
    await requireAuth("ADMIN");
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    const status = url.searchParams.get("status"); // active | suspended | all

    const users = await prisma.user.findMany({
      where: {
        role: { in: ["ADMIN", "EMPLOYEE"] },
        ...(status === "active" ? { active: true } : {}),
        ...(status === "suspended" ? { active: false } : {}),
        ...(q
          ? {
              OR: [
                { email: { contains: q, mode: "insensitive" } },
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
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
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
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
  role: z.enum(["EMPLOYEE", "ADMIN"]).default("EMPLOYEE"),
  allowedStores: z.array(storeEnum).default([HAUTMONT_STOCK_CODE, LE_QUESNOY_STOCK_CODE]),
  active: z.boolean().default(true),
  /** Code saisi par l’admin — sinon généré automatiquement. */
  accessCode: z.string().min(8).max(64).optional(),
  phone: z.string().max(30).optional().nullable(),
});

/** Création employé OU bootstrap des comptes démo (action dédiée). */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth("ADMIN");
    const body = await request.json();

    if (body?.action === "ensure_access_codes") {
      const { ensureInventoryStaffAccessCodes } = await import(
        "@/lib/admin/ensure-inventory-staff"
      );
      const result = await ensureInventoryStaffAccessCodes();
      await writeAuditLog({
        user: auth,
        action: "USER_ENSURE_ACCESS_CODES",
        ip: clientIp(request),
        metadata: {
          staffCount: result.staffCount,
          issuedCount: result.issued.length,
        },
      });
      return jsonResponse({
        staffCount: result.staffCount,
        users: result.users,
        issued: result.issued.map((i) => ({
          userId: i.userId,
          email: i.email,
          firstName: i.firstName,
          lastName: i.lastName,
          temporaryPassword: i.temporaryPassword,
          created: i.created,
        })),
      });
    }

    const data = createSchema.parse(body);

    const existing = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });
    if (existing) throw new Error("EMAIL_EXISTS");

    const plain = data.accessCode?.trim() || generateTempAccessCode();
    if (plain.length < 8) {
      return jsonResponse(
        { error: "Le code d’accès doit contenir au moins 8 caractères." },
        400
      );
    }
    const passwordHash = await hashPassword(plain);
    const user = await prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone || null,
        role: data.role,
        allowedStores: data.allowedStores,
        active: data.active,
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
  role: z.enum(["EMPLOYEE", "ADMIN"]).optional(),
  email: z.string().email().max(254).optional(),
  firstName: z.string().min(1).max(80).optional(),
  lastName: z.string().min(1).max(80).optional(),
  phone: z.string().max(30).optional().nullable(),
  active: z.boolean().optional(),
  allowedStores: z.array(storeEnum).optional(),
  resetPassword: z.boolean().optional(),
});

/**
 * Mise à jour / activation / suspension / reset code (admin).
 * Le code temporaire n’est renvoyé que si resetPassword=true — jamais stocké en clair.
 */
export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth("ADMIN");
    const data = patchSchema.parse(await request.json());

    const target = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!target) throw new Error("NOT_FOUND");
    if (target.role === "CUSTOMER") {
      return jsonResponse({ error: "Compte client hors périmètre inventaire." }, 400);
    }

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
      return jsonResponse({ error: "Vous ne pouvez pas vous suspendre vous-même." }, 400);
    }

    if (data.email) {
      const email = data.email.toLowerCase();
      if (email !== target.email) {
        const clash = await prisma.user.findUnique({ where: { email } });
        if (clash) throw new Error("EMAIL_EXISTS");
      }
    }

    let temporaryPassword: string | undefined;
    let passwordHash: string | undefined;
    if (data.resetPassword) {
      temporaryPassword = generateTempAccessCode();
      passwordHash = await hashPassword(temporaryPassword);
    }

    const user = await prisma.user.update({
      where: { id: data.userId },
      data: {
        ...(data.role !== undefined ? { role: data.role } : {}),
        ...(data.email !== undefined ? { email: data.email.toLowerCase() } : {}),
        ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
        ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
        ...(data.allowedStores !== undefined
          ? { allowedStores: data.allowedStores }
          : {}),
        ...(passwordHash ? { passwordHash, mustChangePassword: true } : {}),
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

const deleteSchema = z.object({
  userId: z.string().min(1),
  confirm: z.literal("SUPPRIMER"),
});

/**
 * Suppression d’un accès EMPLOYEE (pas d’ADMIN).
 * Double confirmation côté client + confirm=SUPPRIMER.
 */
export async function DELETE(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth("ADMIN");
    const data = deleteSchema.parse(await request.json());

    if (data.userId === auth.userId) {
      return jsonResponse({ error: "Vous ne pouvez pas supprimer votre propre compte." }, 400);
    }

    const target = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!target) throw new Error("NOT_FOUND");
    if (target.role !== "EMPLOYEE") {
      return jsonResponse(
        { error: "Seuls les accès employés peuvent être supprimés. Suspendez un admin." },
        400
      );
    }

    await prisma.user.delete({ where: { id: data.userId } });

    await writeAuditLog({
      user: auth,
      action: "USER_DELETED",
      ip: clientIp(request),
      metadata: { targetUserId: target.id, targetEmail: target.email, role: target.role },
    });

    return jsonResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
