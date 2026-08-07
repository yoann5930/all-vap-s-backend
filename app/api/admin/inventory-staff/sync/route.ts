import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import prisma from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { INVENTORY_STAFF } from "@/lib/inventory/staff-accounts";

export const dynamic = "force-dynamic";

const accountSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  role: z.enum(["EMPLOYEE", "ADMIN"]),
  allowedStores: z.array(z.string()).default(["HAUTMONT", "LE_QUESNOY"]),
  /** Si false, ne pas écraser le hash d’un compte déjà présent (défaut: true pour EMPLOYEE). */
  resetPassword: z.boolean().optional(),
});

const bodySchema = z.object({
  accounts: z.array(accountSchema).min(1).max(20),
});

function secretOk(provided: string | null, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Sync one-shot des comptes inventaire sur la DB runtime (Vercel/Render).
 * Auth : header `x-inventory-sync-secret` = INVENTORY_STAFF_SYNC_SECRET
 * Ne log jamais les mots de passe.
 */
export async function POST(request: NextRequest) {
  try {
    const expected = (process.env.INVENTORY_STAFF_SYNC_SECRET || "").trim();
    if (!expected || expected.length < 24) {
      return NextResponse.json(
        { error: "Sync non configuré (INVENTORY_STAFF_SYNC_SECRET)" },
        { status: 503 }
      );
    }

    const provided =
      request.headers.get("x-inventory-sync-secret") ||
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
      null;

    if (!secretOk(provided, expected)) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const body = bodySchema.parse(await request.json());
    const allowedEmails = new Set(
      INVENTORY_STAFF.map((s) => s.email.toLowerCase())
    );

    const results: Array<{
      email: string;
      action: string;
      role: string;
      active: boolean;
    }> = [];

    for (const acc of body.accounts) {
      const email = acc.email.trim().toLowerCase();
      if (!allowedEmails.has(email)) {
        results.push({
          email,
          action: "SKIPPED_NOT_IN_STAFF_LIST",
          role: acc.role,
          active: false,
        });
        continue;
      }

      const existing = await prisma.user.findUnique({ where: { email } });
      const resetPassword =
        acc.resetPassword ?? (email !== "yoann@allvaps.fr");

      // Ne jamais écraser le MDP admin Yoann sauf demande explicite resetPassword=true
      if (email === "yoann@allvaps.fr" && existing && resetPassword !== true) {
        await prisma.user.update({
          where: { email },
          data: {
            firstName: acc.firstName,
            lastName: acc.lastName,
            role: "ADMIN",
            allowedStores: acc.allowedStores,
            active: true,
            emailVerified: true,
          },
        });
        results.push({
          email,
          action: "UPDATED_META_ONLY",
          role: "ADMIN",
          active: true,
        });
        continue;
      }

      const passwordHash = await hashPassword(acc.password);

      if (!existing) {
        await prisma.user.create({
          data: {
            email,
            firstName: acc.firstName,
            lastName: acc.lastName,
            role: acc.role,
            allowedStores: acc.allowedStores,
            active: true,
            mustChangePassword: true,
            passwordHash,
            emailVerified: true,
          },
        });
        results.push({
          email,
          action: "CREATED",
          role: acc.role,
          active: true,
        });
      } else {
        await prisma.user.update({
          where: { email },
          data: {
            firstName: acc.firstName,
            lastName: acc.lastName,
            role: acc.role,
            allowedStores: acc.allowedStores,
            active: true,
            emailVerified: true,
            ...(resetPassword
              ? { passwordHash, mustChangePassword: true }
              : {}),
          },
        });
        results.push({
          email,
          action: resetPassword ? "UPDATED_RESET_PASSWORD" : "UPDATED_META",
          role: acc.role,
          active: true,
        });
      }
    }

    return NextResponse.json(
      { ok: true, results },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
