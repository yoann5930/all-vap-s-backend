import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { requireAuth } from "@/lib/jwt";
import prisma from "@/lib/prisma";
import {
  CLIENT_DEMO_EMAIL,
  OWNER_PRIMARY_EMAIL,
  resolveAvaSessionContext,
} from "@/lib/ava/identity-context";
import { AvaError, AvaErrorCode } from "@/lib/ava/errors";
import { writeAuditLog } from "@/lib/audit/log";
import { clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const emailSchema = z.string().email().max(120);

async function requireOwnerSession(user: {
  userId: string;
  email: string;
  role: string;
}) {
  if ((user.email || "").trim().toLowerCase() === CLIENT_DEMO_EMAIL) {
    throw new AvaError(AvaErrorCode.AVA_PERMISSION_DENIED, "client blocked", "Accès refusé");
  }
  const ctx = await resolveAvaSessionContext({
    userId: user.userId,
    email: user.email,
    sessionRole: user.role,
    surface: "admin",
  });
  if (ctx.effectiveRole !== "OWNER") {
    throw new AvaError(
      AvaErrorCode.AVA_PERMISSION_DENIED,
      "OWNER only",
      "Seule l'identité propriétaire peut gérer les OWNER."
    );
  }
  return ctx;
}

export async function GET() {
  try {
    const user = await requireAuth("ADMIN");
    const ctx = await resolveAvaSessionContext({
      userId: user.userId,
      email: user.email,
      sessionRole: user.role,
      surface: "admin",
    });
    if (!ctx.adminCapabilities) {
      return jsonResponse({ error: "Accès refusé", errorCode: AvaErrorCode.AVA_AUTH_FAILED }, 403);
    }
    const rows = await prisma.avaOwnerIdentity.findMany({
      orderBy: { createdAt: "asc" },
    });
    return jsonResponse({
      identities: rows,
      primarySeed: OWNER_PRIMARY_EMAIL,
      canManage: ctx.effectiveRole === "OWNER",
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const postSchema = z.object({
  primaryEmail: emailSchema,
  verify: z.boolean().optional().default(true),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth("ADMIN");
    await requireOwnerSession(user);
    const body = postSchema.parse(await request.json());
    const email = body.primaryEmail.trim().toLowerCase();

    if (email === CLIENT_DEMO_EMAIL) {
      return jsonResponse(
        {
          error: "Ce compte Client ne peut pas devenir OWNER.",
          errorCode: AvaErrorCode.AVA_PERMISSION_DENIED,
        },
        400
      );
    }

    const linked = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    const row = await prisma.avaOwnerIdentity.upsert({
      where: { primaryEmail: email },
      create: {
        primaryEmail: email,
        userId: linked?.id || null,
        verifiedAt: body.verify ? new Date() : null,
        createdByUserId: user.userId,
      },
      update: {
        userId: linked?.id || undefined,
        verifiedAt: body.verify ? new Date() : undefined,
      },
    });

    await writeAuditLog({
      user,
      action: "ava.owner_identity.upsert",
      ip: clientIp(request),
      metadata: { email, verified: !!row.verifiedAt },
    });

    return jsonResponse({ identity: row });
  } catch (error) {
    if (error instanceof AvaError) {
      return jsonResponse({ error: error.publicMessage, errorCode: error.code }, 403);
    }
    return handleApiError(error);
  }
}

const deleteSchema = z.object({
  primaryEmail: emailSchema,
});

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAuth("ADMIN");
    await requireOwnerSession(user);
    const body = deleteSchema.parse(await request.json());
    const email = body.primaryEmail.trim().toLowerCase();

    if (email === OWNER_PRIMARY_EMAIL) {
      return jsonResponse(
        {
          error: "Impossible de supprimer l'adresse OWNER primaire.",
          errorCode: AvaErrorCode.AVA_PERMISSION_DENIED,
        },
        400
      );
    }

    await prisma.avaOwnerIdentity.deleteMany({ where: { primaryEmail: email } });
    await writeAuditLog({
      user,
      action: "ava.owner_identity.delete",
      ip: clientIp(request),
      metadata: { email },
    });
    return jsonResponse({ ok: true });
  } catch (error) {
    if (error instanceof AvaError) {
      return jsonResponse({ error: error.publicMessage, errorCode: error.code }, 403);
    }
    return handleApiError(error);
  }
}

const patchSchema = z.object({
  primaryEmail: emailSchema,
  action: z.enum(["verify", "unverify"]),
});

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuth("ADMIN");
    await requireOwnerSession(user);
    const body = patchSchema.parse(await request.json());
    const email = body.primaryEmail.trim().toLowerCase();
    const row = await prisma.avaOwnerIdentity.update({
      where: { primaryEmail: email },
      data: {
        verifiedAt: body.action === "verify" ? new Date() : null,
      },
    });
    await writeAuditLog({
      user,
      action: `ava.owner_identity.${body.action}`,
      ip: clientIp(request),
      metadata: { email },
    });
    return jsonResponse({ identity: row });
  } catch (error) {
    if (error instanceof AvaError) {
      return jsonResponse({ error: error.publicMessage, errorCode: error.code }, 403);
    }
    return handleApiError(error);
  }
}
