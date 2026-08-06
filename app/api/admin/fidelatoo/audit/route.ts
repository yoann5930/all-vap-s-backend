import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { handleApiError } from "@/lib/api-utils";
import { requireFidelatooAdmin, noStoreHeaders } from "@/lib/fidelatoo/admin-guard";
import { auditQuerySchema } from "@/lib/fidelatoo/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireFidelatooAdmin(request);
    const url = new URL(request.url);
    const { take } = auditQuerySchema.parse({
      take: url.searchParams.get("take") || 50,
    });

    const logs = await prisma.auditLog.findMany({
      where: { action: { startsWith: "fidelatoo." } },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        action: true,
        userEmail: true,
        userRole: true,
        ip: true,
        metadata: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ logs }, { headers: noStoreHeaders() });
  } catch (error) {
    return handleApiError(error);
  }
}
