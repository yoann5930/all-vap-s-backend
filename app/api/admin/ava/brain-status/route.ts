import { NextResponse } from "next/server";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { requireAuth } from "@/lib/jwt";
import { getAvaSessionFromAuth } from "@/lib/auth/user-context";
import { CLIENT_DEMO_EMAIL } from "@/lib/ava/identity-context";
import { probeAvaLlmProviders, resolveAvaLlmProviderMode } from "@/lib/ai/providers";
import { loadAdminPersistentMemory } from "@/lib/ava/admin-memory";
import { listReflections } from "@/lib/ava/business-intelligence";
import { getFidelatooStatus } from "@/lib/fidelatoo/orchestrator";
import {
  decideEngineRole,
  getReachableRuntime,
  localBrainEndpointLabel,
} from "@/lib/ai/local";

export const dynamic = "force-dynamic";

/**
 * Statut cerveau A.V.A. Admin — Admin only.
 * Pas de détail modèle exposé au client public ; UI Admin seulement.
 */
export async function GET() {
  try {
    const user = await requireAuth("ADMIN");
    const email = (user.email || "").trim().toLowerCase();
    if (email === CLIENT_DEMO_EMAIL) {
      return jsonResponse({ error: "Accès refusé" }, 403);
    }
    const ava = await getAvaSessionFromAuth("ADMIN");
    if (!ava?.adminCapabilities) {
      return jsonResponse({ error: "Session Admin requise" }, 403);
    }

    const mode = resolveAvaLlmProviderMode();
    const providers = await probeAvaLlmProviders();
    const rt = await getReachableRuntime();
    const decision = await decideEngineRole("conversation", rt);

    let memoryCount = 0;
    try {
      const mem = await loadAdminPersistentMemory(user.userId);
      memoryCount = mem.items.filter((i) => i.status === "active").length;
    } catch {
      memoryCount = 0;
    }

    let reflectionsOk = true;
    let reflectionsCount = 0;
    try {
      const refs = await listReflections(user.userId);
      reflectionsCount = refs.length;
    } catch {
      reflectionsOk = false;
    }

    let orchestratorReachable = false;
    try {
      const st = await getFidelatooStatus();
      orchestratorReachable = Boolean(st?.orchestratorReachable);
    } catch {
      orchestratorReachable = false;
    }

    const localActive =
      providers.local.reachable ||
      Boolean(rt) ||
      Boolean(providers.gateway?.configured && providers.local.reachable);

    return jsonResponse({
      ok: true,
      engine: {
        local: localActive ? "actif" : "inactif",
        providerMode: mode,
        endpoint: localBrainEndpointLabel(),
        /** Modèle actuellement sélectionné pour conversation — UI Admin seulement */
        loadedModelHint: decision?.model || providers.local.model || null,
        runtime: rt?.id || null,
        openaiRequired: false,
      },
      memory: {
        state: memoryCount >= 0 ? "ok" : "indisponible",
        activeCount: memoryCount,
      },
      reflections: {
        state: reflectionsOk ? "ok" : "indisponible",
        count: reflectionsCount,
      },
      orchestrator: {
        state: orchestratorReachable ? "joignable" : "injoignable",
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
