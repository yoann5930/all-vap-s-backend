import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { requireAuth } from "@/lib/jwt";
import { getAvaSessionFromAuth } from "@/lib/auth/user-context";
import { CLIENT_DEMO_EMAIL } from "@/lib/ava/identity-context";
import {
  listReflections,
  listBusinessMemory,
  listExperiments,
  runBusinessIntelligence,
} from "@/lib/ava/business-intelligence";

export const dynamic = "force-dynamic";

async function assertAdmin() {
  const user = await requireAuth("ADMIN");
  const email = (user.email || "").trim().toLowerCase();
  if (email === CLIENT_DEMO_EMAIL) {
    return { error: jsonResponse({ error: "Accès refusé" }, 403) };
  }
  const ava = await getAvaSessionFromAuth("ADMIN");
  if (!ava?.adminCapabilities) {
    return { error: jsonResponse({ error: "Session Admin requise" }, 403) };
  }
  return { user };
}

/** Réflexions métier structurées — Admin only. */
export async function GET() {
  try {
    const gate = await assertAdmin();
    if ("error" in gate && gate.error) return gate.error;
    const user = gate.user!;
    const [reflections, memory, experiments] = await Promise.all([
      listReflections(user.userId),
      listBusinessMemory(user.userId),
      listExperiments(user.userId),
    ]);
    return jsonResponse({
      mode: "admin_ava_reflections",
      reflections,
      businessMemory: memory.slice(0, 40),
      experiments: experiments.slice(0, 20),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

const postSchema = z.object({
  action: z.literal("refresh"),
  includeMarket: z.boolean().optional(),
});

/** Relance le pipeline BI et persiste les cartes. */
export async function POST(request: NextRequest) {
  try {
    const gate = await assertAdmin();
    if ("error" in gate && gate.error) return gate.error;
    const user = gate.user!;
    const body = postSchema.parse(await request.json().catch(() => ({ action: "refresh" })));
    try {
      const bundle = await runBusinessIntelligence({
        ownerUserId: user.userId,
        includeMarket: body.includeMarket ?? false,
        persist: true,
      });
      return jsonResponse({
        ok: true,
        reflections: bundle.reflections,
        anomalies: bundle.anomalies,
        ideas: bundle.ideas.filter((i) => i.verdict !== "A_EVITER").slice(0, 12),
        tour: bundle.tour,
        missingData: bundle.missingData,
        generatedAt: bundle.generatedAt,
        warning:
          bundle.reflections.length === 0 && bundle.missingData.length
            ? `Analyse partielle — sources manquantes : ${bundle.missingData.join(", ")}`
            : undefined,
      });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      console.error("[ava.reflections] refresh failed", detail.slice(0, 500));
      return jsonResponse(
        {
          ok: false,
          error: "Analyse impossible",
          detail: detail.slice(0, 400),
          code: "BI_PIPELINE_FAILED",
        },
        500
      );
    }
  } catch (e) {
    return handleApiError(e);
  }
}
