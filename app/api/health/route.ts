import { NextRequest } from "next/server";
import { jsonResponse } from "@/lib/api-utils";
import {
  checkApplication,
  checkDatabase,
  overallStatus,
} from "@/lib/health/checks";
import { REQUEST_ID_HEADER, resolveRequestId } from "@/lib/ops/request-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health — liveness + readiness DB uniquement.
 * Pas de SumUp, SMTP, audit writes, catalogue, ni appels externes.
 * Timeout DB strict (voir lib/health/checks.ts).
 */
export async function GET(request: NextRequest) {
  const application = checkApplication();
  const database = await checkDatabase();
  const status = overallStatus(application, database);
  const http = status === "error" ? 503 : 200;
  const requestId = resolveRequestId(request);

  const res = jsonResponse(
    {
      status,
      ok: status !== "error",
      service: "all-vaps",
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      requestId,
      checks: {
        application: application.status,
        database: database.status,
      },
      details: {
        database: database.detail
          ? { detail: database.detail, ms: database.ms }
          : { ms: database.ms },
      },
      observability: {
        requestIdHeader: REQUEST_ID_HEADER,
        structuredLogs: "ops-json",
      },
    },
    http
  );
  res.headers.set(REQUEST_ID_HEADER, requestId);
  return res;
}
