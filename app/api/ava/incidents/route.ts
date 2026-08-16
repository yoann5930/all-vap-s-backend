import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { getAuthUser } from "@/lib/jwt";
import {
  createDiagnosticIncident,
  listIncidentsForAdmin,
  updateIncidentStatus,
} from "@/lib/ava/diagnostic-incidents";

const createSchema = z.object({
  symptomFreeText: z.string().min(3).max(2000),
  clientMessage: z.string().max(4000).optional(),
  productId: z.string().optional(),
  manufacturer: z.string().max(120).optional(),
  model: z.string().max(120).optional(),
  mediaIds: z.array(z.string()).max(10).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser();
    if (!auth?.userId) return jsonResponse({ error: "Non authentifié" }, 401);

    const role = (auth as { role?: string }).role;
    if (role === "ADMIN" || role === "STAFF") {
      const items = await listIncidentsForAdmin(100);
      return jsonResponse({ incidents: items });
    }

    const { default: prisma } = await import("@/lib/prisma");
    const mine = await prisma.avaDiagnosticIncident.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        manufacturer: true,
        model: true,
        symptomFreeText: true,
        riskLevel: true,
        status: true,
        recommendations: true,
        createdAt: true,
      },
    });
    return jsonResponse({ incidents: mine });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser().catch(() => null);
    const body = createSchema.parse(await req.json());
    const result = await createDiagnosticIncident({
      userId: auth?.userId,
      ...body,
    });
    if (!result.ok) {
      return jsonResponse(
        { error: result.error, excluded: true },
        result.excluded ? 400 : 400,
      );
    }
    return jsonResponse({
      incidentId: result.incident.id,
      status: result.incident.status,
      riskLevel: result.incident.riskLevel,
      recommendations: result.incident.recommendations,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await getAuthUser();
    if (!auth?.userId) return jsonResponse({ error: "Non authentifié" }, 401);
    const role = (auth as { role?: string }).role;
    if (role !== "ADMIN" && role !== "STAFF") {
      return jsonResponse({ error: "Accès refusé" }, 403);
    }
    const body = z
      .object({
        id: z.string(),
        status: z.string().optional(),
        manufacturer: z.string().optional(),
        model: z.string().optional(),
        knowledgePromoted: z.boolean().optional(),
        recommendations: z.string().optional(),
      })
      .parse(await req.json());
    const updated = await updateIncidentStatus(body.id, body);
    return jsonResponse({ incident: updated });
  } catch (e) {
    return handleApiError(e);
  }
}
