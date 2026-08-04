import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";

/** Journal d'audit — ADMIN uniquement. */
export async function GET(request: NextRequest) {
  try {
    await requireAuth("ADMIN");
    const url = new URL(request.url);
    const take = Math.min(Number(url.searchParams.get("take") || 50), 200);
    const userId = url.searchParams.get("userId") || undefined;
    const action = url.searchParams.get("action") || undefined;

    const where = z
      .object({
        userId: z.string().optional(),
        action: z.string().optional(),
      })
      .parse({ userId, action });

    const logs = await prisma.auditLog.findMany({
      where: {
        ...(where.userId ? { userId: where.userId } : {}),
        ...(where.action ? { action: where.action } : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
    });

    return jsonResponse({ logs });
  } catch (error) {
    return handleApiError(error);
  }
}
