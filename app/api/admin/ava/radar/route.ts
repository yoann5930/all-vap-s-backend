import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { requireAuth } from "@/lib/jwt";
import { getAvaSessionFromAuth } from "@/lib/auth/user-context";
import { CLIENT_DEMO_EMAIL } from "@/lib/ava/identity-context";
import {
  gatherMarketRadar,
  listMarketSignals,
  saveMarketSignals,
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

/** Radar marché — sources publiques ; jamais d'import produit auto. */
export async function GET() {
  try {
    const gate = await assertAdmin();
    if ("error" in gate && gate.error) return gate.error;
    const user = gate.user!;
    const signals = await listMarketSignals(user.userId);
    return jsonResponse({
      mode: "admin_ava_market_radar",
      signals,
      note: "Observation marché uniquement — aucun produit n'est importé automatiquement.",
    });
  } catch (e) {
    return handleApiError(e);
  }
}

const postSchema = z.object({
  action: z.literal("refresh"),
});

export async function POST(request: NextRequest) {
  try {
    const gate = await assertAdmin();
    if ("error" in gate && gate.error) return gate.error;
    const user = gate.user!;
    postSchema.parse(await request.json().catch(() => ({ action: "refresh" })));
    const { signals, missingData } = await gatherMarketRadar();
    await saveMarketSignals(user.userId, signals);
    return jsonResponse({
      ok: true,
      signals,
      missingData,
      importProduct: false,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
