import { NextRequest } from "next/server";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { runBusinessIntelligence } from "@/lib/ava/business-intelligence";
import prisma from "@/lib/prisma";

function authorizeCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  return token === secret;
}

/**
 * Tour du magasin + radar partiel — cron H24.
 * Persiste pour le compte OWNER principal si trouvé.
 */
export async function GET(request: NextRequest) {
  try {
    if (!authorizeCron(request)) {
      return jsonResponse({ error: "Non autorisé" }, 401);
    }

    const ownerEmail = (process.env.AVA_OWNER_EMAIL || "yoann@allvaps.fr")
      .trim()
      .toLowerCase();
    const owner = await prisma.user.findFirst({
      where: { email: { equals: ownerEmail, mode: "insensitive" } },
      select: { id: true },
    });

    const bundle = await runBusinessIntelligence({
      ownerUserId: owner?.id || null,
      includeMarket: true,
      persist: Boolean(owner?.id),
    });

    return jsonResponse({
      ok: true,
      ownerPersisted: Boolean(owner?.id),
      anomalies: bundle.anomalies.length,
      reflections: bundle.reflections.length,
      ideas: bundle.ideas.length,
      marketSignals: bundle.marketSignals?.length || 0,
      missingData: bundle.missingData.slice(0, 10),
      greeting: bundle.tour?.greeting || null,
      generatedAt: bundle.generatedAt,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
