import { NextRequest } from "next/server";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { processUnhandledReadyOrders } from "@/lib/ava-order/ready-handler";

function authorizeCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  return token === secret;
}

/** Reprise des commandes PREPARED non traitées après redémarrage AVA. */
export async function GET(request: NextRequest) {
  try {
    if (!authorizeCron(request)) {
      return jsonResponse({ error: "Non autorisé" }, 401);
    }
    const result = await processUnhandledReadyOrders(50);
    return jsonResponse({ ok: true, ...result });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
