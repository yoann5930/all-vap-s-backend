import { NextRequest } from "next/server";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { getSumUpSyncConfig } from "@/lib/sumup/config";
import { runSumUpSync } from "@/lib/sumup/sync-service";

function authorizeCron(request: NextRequest): boolean {
  const cfg = getSumUpSyncConfig();
  if (!cfg.cronSecret) return false;
  const auth = request.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  return token === cfg.cronSecret;
}

/** Cron / worker externe — GET ou POST */
export async function GET(request: NextRequest) {
  try {
    if (!authorizeCron(request)) {
      return jsonResponse({ error: "Non autorisé" }, 401);
    }
    const dryRun = request.nextUrl.searchParams.get("dryRun") === "true";
    const result = await runSumUpSync({
      dryRun,
      lockOwner: "cron",
    });
    return jsonResponse(result, result.ok ? 200 : 500);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
