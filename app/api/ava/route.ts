import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { runAvaBrain } from "@/lib/ava/unified-brain";
import { getAuthUser } from "@/lib/jwt";
import {
  avaEndpointManifest,
  parseAvaPublicAction,
  resolveAvaChannel,
} from "@/lib/ava/central-router";
import { personIdFromEmail } from "@/lib/ava/shared-memory";

export const dynamic = "force-dynamic";

/**
 * Point d'entrée unique AVA (Android + Admin authentifié).
 * Catalogue et Internet sont des outils internes de runAvaBrain.
 * Aucune écriture stock / produit.
 */
const bodySchema = z.object({
  action: z.string().max(40).optional(),
  sessionId: z.string().min(1).max(64),
  message: z.string().min(1).max(500).optional(),
  context: z
    .object({
      fidelatooInstalled: z.boolean().optional(),
      allVapsConnected: z.boolean().optional(),
      employeeId: z.string().max(40).optional(),
      employeeName: z.string().max(80).optional(),
      clientSource: z.string().max(40).optional(),
    })
    .optional(),
});

export async function GET() {
  return jsonResponse(avaEndpointManifest());
}

export async function POST(req: NextRequest) {
  try {
    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return jsonResponse({ status: "error", error: "invalid_body" }, 400);
    }

    const action = parseAvaPublicAction(parsed.data.action);
    if (action === "forbidden") {
      return jsonResponse(
        {
          status: "error",
          error: "forbidden_action",
          response: "Je n'ai pas le droit de modifier le stock ni les produits.",
        },
        403,
      );
    }
    if (action === "invalid") {
      return jsonResponse({ status: "error", error: "invalid_action" }, 400);
    }

    if (action === "end_session") {
      return jsonResponse({
        sessionId: parsed.data.sessionId,
        status: "ended",
        avaSystemId: avaEndpointManifest().avaSystemId,
      });
    }

    const message = parsed.data.message?.trim() || "";
    if (!message) {
      return jsonResponse({ status: "error", error: "invalid_body" }, 400);
    }

    const authUser = await getAuthUser().catch(() => null);
    const channel = resolveAvaChannel(
      authUser
        ? { authenticated: true, role: authUser.role }
        : { authenticated: false, role: null },
    );
    console.info("AVA_REQUEST");
    console.info(channel === "ADMIN_WEB" ? "AVA_CHANNEL_ADMIN" : "AVA_CHANNEL_ANDROID");

    const trustedPerson =
      channel === "ADMIN_WEB" && authUser?.email
        ? personIdFromEmail(authUser.email)
        : "unknown";

    const brain = await runAvaBrain({
      channel,
      message,
      sessionId: parsed.data.sessionId,
      employeeId: trustedPerson === "unknown" ? null : trustedPerson,
    });

    return jsonResponse({
      sessionId: parsed.data.sessionId,
      response: brain.response,
      status: "ok",
      source: brain.source,
      avaSystemId: brain.avaSystemId,
      channel: brain.channel,
      personId: brain.personId,
      tool: brain.tool,
      memoryUsed: brain.memoryUsed,
      proposedAction: brain.proposedAction,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

function writeBlocked() {
  return jsonResponse(
    { error: "Lecture seule. AVA ne peut pas modifier le catalogue ni le stock." },
    405,
  );
}

export async function PUT() {
  return writeBlocked();
}
export async function PATCH() {
  return writeBlocked();
}
export async function DELETE() {
  return writeBlocked();
}
