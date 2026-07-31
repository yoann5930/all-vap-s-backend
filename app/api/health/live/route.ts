import { jsonResponse } from "@/lib/api-utils";
import { checkApplication } from "@/lib/health/checks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/health/live — process vivant, aucun I/O. */
export async function GET() {
  const application = checkApplication();
  return jsonResponse({
    status: "ok",
    service: "all-vaps",
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    checks: { application: application.status },
  });
}
