import { NextResponse } from "next/server";
import { getAuthUser, clearAuthCookie } from "@/lib/jwt";
import prisma from "@/lib/prisma";
import { handleApiError } from "@/lib/api-utils";

/**
 * Session courante (cookie httpOnly et/ou Authorization Bearer).
 *
 * IMPORTANT — ne sélectionner QUE des colonnes présentes dans prisma/schema.prisma.
 * Le champ fantôme `twoFactorEnabled` provoquait un 500 Prisma et cassait le
 * handshake post-login (« Connexion acceptée mais session non conservée »).
 */
export async function GET() {
  try {
    const auth = await getAuthUser();
    if (!auth) {
      return NextResponse.json(
        { authenticated: false, user: null },
        { status: 401, headers: { "Cache-Control": "no-store, private" } }
      );
    }

    // Colonnes inventaire staff uniquement (jamais twoFactorEnabled / totp*).
    // Fallback si une colonne inventaire manque encore en base.
    let user: {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      phone: string | null;
      role: string;
      active: boolean;
      mustChangePassword: boolean;
      allowedStores: string[];
      lastLoginAt: Date | null;
      emailVerified: boolean;
      createdAt: Date;
    } | null = null;

    try {
      user = await prisma.user.findUnique({
        where: { id: auth.userId },
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
        },
      });
    } catch (selectErr) {
      console.error(
        "[auth/me] full select failed, fallback minimal:",
        selectErr instanceof Error ? selectErr.message.slice(0, 200) : selectErr
      );
      const minimal = await prisma.user.findUnique({
        where: { id: auth.userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          emailVerified: true,
          createdAt: true,
        },
      });
      if (minimal) {
        user = {
          ...minimal,
          active: true,
          mustChangePassword: false,
          allowedStores: [],
          lastLoginAt: null,
        };
      }
    }

    if (!user || user.active === false) {
      try {
        await clearAuthCookie();
      } catch {
        /* cookie store indisponible hors requête */
      }
      return NextResponse.json(
        { authenticated: false, user: null },
        { status: 401, headers: { "Cache-Control": "no-store, private" } }
      );
    }

    return NextResponse.json(
      {
        authenticated: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          role: user.role,
          active: user.active,
          mustChangePassword: user.mustChangePassword,
          allowedStores: user.allowedStores,
          lastLoginAt: user.lastLoginAt,
          emailVerified: user.emailVerified,
          createdAt: user.createdAt,
        },
      },
      { status: 200, headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (error) {
    // Ne jamais laisser un 500 Prisma opaque casser le handshake sans code.
    const msg = error instanceof Error ? error.message : String(error);
    if (/Unknown argument|Unknown field|does not exist|column/i.test(msg)) {
      console.error("[auth/me] schema mismatch:", msg.slice(0, 300));
      return NextResponse.json(
        {
          authenticated: false,
          user: null,
          error: "Lecture session impossible (schéma)",
          code: "SESSION_SCHEMA_MISMATCH",
        },
        { status: 500, headers: { "Cache-Control": "no-store, private" } }
      );
    }
    return handleApiError(error);
  }
}

export async function DELETE() {
  try {
    await clearAuthCookie();
    return NextResponse.json(
      { success: true },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
