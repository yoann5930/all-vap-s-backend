import { jsonResponse } from "@/lib/api-utils";
import {
  checkApplication,
  checkAuditModePublic,
  checkDatabase,
  checkOptionalEnvServices,
  overallStatus,
} from "@/lib/health/checks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health/details — diagnostics non bloquants.
 * Services optionnels = lecture env uniquement (pas d'envoi mail / sync SumUp).
 */
export async function GET() {
  const application = checkApplication();
  const [databaseSettled, auditSettled] = await Promise.allSettled([
    checkDatabase(),
    checkAuditModePublic(),
  ]);

  const database =
    databaseSettled.status === "fulfilled"
      ? databaseSettled.value
      : {
          status: "error" as const,
          detail:
            databaseSettled.reason instanceof Error
              ? databaseSettled.reason.message
              : String(databaseSettled.reason),
        };

  const audit =
    auditSettled.status === "fulfilled"
      ? auditSettled.value
      : {
          status: "error" as const,
          detail:
            auditSettled.reason instanceof Error
              ? auditSettled.reason.message
              : String(auditSettled.reason),
        };

  const optional = checkOptionalEnvServices();
  const status = overallStatus(application, database);

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
        audit_mode: audit.status,
        ...Object.fromEntries(
          Object.entries(optional).map(([k, v]) => [k, v.status])
        ),
      },
      services: {
        application,
        database,
        audit_mode: audit,
        ...optional,
      },
      note: "Optional services are env-only checks; no external network calls.",
    },
    status === "error" ? 503 : 200
  );
}
