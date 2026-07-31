import { jsonResponse } from "@/lib/api-utils";
import {
  checkApplication,
  checkDatabase,
  overallStatus,
} from "@/lib/health/checks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/health/ready — dépendances indispensables (DB). */
export async function GET() {
  const application = checkApplication();
  const database = await checkDatabase();
  const status = overallStatus(application, database);
  const http = status === "error" ? 503 : 200;

  return jsonResponse(
    {
      status,
      ok: status !== "error",
      service: "all-vaps",
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      checks: {
        application: application.status,
        database: database.status,
      },
      details: {
        database: {
          detail: database.detail,
          ms: database.ms,
        },
      },
    },
    http
  );
}
