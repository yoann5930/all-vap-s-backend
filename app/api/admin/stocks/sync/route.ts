import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { connectSumUpStock } from "@/lib/sumup/stock-connect";
import { logStockEvent } from "@/lib/stock";
import { isSumUpSyncConfigured } from "@/lib/sumup/config";

/** Forcer connexion stock SumUp (CSV + miroir + transactions) — ADMIN uniquement. */
export async function POST(request: Request) {
  try {
    await requireAuth("ADMIN");
    const ip = clientIp(request);
    const limit = checkRateLimit(`admin-stock-sync:${ip}`, 5, 15 * 60 * 1000);
    if (!limit.ok) {
      return jsonResponse(
        { error: "Trop de synchronisations. Réessayez plus tard.", retryAfterSec: limit.retryAfterSec },
        429
      );
    }

    if (!isSumUpSyncConfigured()) {
      await logStockEvent({
        type: "SYNC_ERROR",
        message: "SumUp non configuré — sync forcée impossible",
      });
      return jsonResponse(
        {
          ok: false,
          message:
            "Le stock est en cours de vérification. Merci de réessayer dans quelques instants.",
          code: "SUMUP_NOT_CONFIGURED",
        },
        503
      );
    }

    await logStockEvent({ type: "FORCE_SYNC", message: "Connexion stock + push catalogue SumUp forcée (admin)" });
    const result = await connectSumUpStock({ forceTransactions: true });
    await logStockEvent({
      type: result.ok ? "SYNC" : "SYNC_ERROR",
      message: result.message,
      meta: {
        mirrorCreated: result.mirror.createdLevels,
        mirrorUpdated: result.mirror.updatedLevels,
        csvApplied: result.csvInbox.applied,
        catalogPushNames: result.catalogPush?.nameUpdates,
        catalogPushImages: result.catalogPush?.imageUpdates,
        catalogPushOutbox: result.catalogPush?.outboxCsv,
        salesApplied: result.transactions?.salesApplied,
        refundsApplied: result.transactions?.refundsApplied,
        errors: result.transactions?.errors?.slice?.(0, 5),
      },
    });
    return jsonResponse({
      ok: result.ok,
      message: result.message,
      catalogApiAvailable: result.catalogApiAvailable,
      catalogApiNote: result.catalogApiNote,
      mirror: result.mirror,
      csvInbox: result.csvInbox,
      salesApplied: result.transactions?.salesApplied ?? 0,
      refundsApplied: result.transactions?.refundsApplied ?? 0,
      transactionsProcessed: result.transactions?.transactionsProcessed ?? 0,
      syncRunId: result.transactions?.syncRunId ?? null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
