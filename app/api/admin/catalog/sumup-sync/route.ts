import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { testSumUpConnection } from "@/lib/sumup/api-client";
import { getSumUpSyncConfig, isSumUpSyncConfigured } from "@/lib/sumup/config";
import { runSumUpSync } from "@/lib/sumup/sync-service";

export async function GET() {
  try {
    await requireAuth("ADMIN");
    const cfg = getSumUpSyncConfig();
    const connection = await testSumUpConnection();
    return jsonResponse({
      configured: isSumUpSyncConfigured(),
      syncEnabled: cfg.syncEnabled,
      syncIntervalSeconds: cfg.syncIntervalSeconds,
      catalogueMagasinPath: cfg.catalogueMagasinPath,
      catalogueAvaPath: cfg.catalogueAvaPath,
      connection,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth("ADMIN");
    const body = z
      .object({
        dryRun: z.boolean().default(true),
        force: z.boolean().default(true),
      })
      .parse(await request.json().catch(() => ({ dryRun: true, force: true })));

    const result = await runSumUpSync({
      dryRun: body.dryRun,
      force: body.force,
      lockOwner: "admin-manual",
    });

    return jsonResponse(result, result.ok ? 200 : 500);
  } catch (error) {
    return handleApiError(error);
  }
}
