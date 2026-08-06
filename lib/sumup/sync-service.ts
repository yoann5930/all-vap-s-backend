/**
 * Synchronisation SumUp → PostgreSQL (stock_general) + export catalogues CSV.
 * Idempotent, verrouillée, serveur uniquement.
 */
import prisma from "@/lib/prisma";
import { GLOBAL_STOCK_CODE } from "@/lib/catalog/normalize";
import { applyGlobalSale, applyGlobalRefund, ensureGlobalStockLocation } from "@/lib/catalog/stock";
import { exportOfficialCatalogues } from "@/lib/catalog/catalogue-csv-export";
import { getSumUpSyncConfig, safeLogPayload, isSumUpSyncConfigured } from "@/lib/sumup/config";
import {
  getTransactionFull,
  isRefundTransaction,
  isSuccessfulSale,
  listTransactionHistory,
  resolveTransactionId,
  type SumUpTransactionFull,
  type SumUpTransactionHistoryItem,
} from "@/lib/sumup/api-client";
import { loadCatalogCandidates, matchSumUpProductLine } from "@/lib/sumup/transaction-matcher";
import { writeSumUpSyncReport } from "@/lib/sumup/sync-report";
import { normalizeProductName } from "@/lib/catalog/normalize";

export type SumUpSyncResult = {
  ok: boolean;
  dryRun: boolean;
  skipped: boolean;
  syncRunId: string | null;
  transactionsFetched: number;
  transactionsProcessed: number;
  transactionsSkipped: number;
  duplicates: number;
  salesApplied: number;
  refundsApplied: number;
  unrecognizedLines: number;
  recognizedProducts: string[];
  unrecognizedProducts: string[];
  errors: string[];
  catalogExport?: { magasin: string; ava: string };
  message: string;
};

const LOCK_TTL_MS = 15 * 60 * 1000;
const SOURCE = "sumup_api";

async function ensureSyncState() {
  return prisma.sumUpSyncState.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
}

async function acquireLock(owner: string): Promise<boolean> {
  const now = new Date();
  const state = await ensureSyncState();
  if (state.lockedUntil && state.lockedUntil > now && state.lockOwner !== owner) {
    return false;
  }
  await prisma.sumUpSyncState.update({
    where: { id: "default" },
    data: {
      lockedUntil: new Date(now.getTime() + LOCK_TTL_MS),
      lockOwner: owner,
    },
  });
  return true;
}

async function releaseLock(owner: string) {
  const state = await prisma.sumUpSyncState.findUnique({ where: { id: "default" } });
  if (state?.lockOwner === owner) {
    await prisma.sumUpSyncState.update({
      where: { id: "default" },
      data: { lockedUntil: null, lockOwner: null },
    });
  }
}

async function fetchTransactionDetails(
  item: SumUpTransactionHistoryItem
): Promise<SumUpTransactionFull> {
  const id = resolveTransactionId(item);
  if (!id && !item.transaction_code) return item;
  try {
    return await getTransactionFull({
      id: item.transaction_id || item.id,
      transactionCode: item.transaction_code,
    });
  } catch {
    return item;
  }
}

function extractProductLines(tx: SumUpTransactionFull) {
  if (tx.products?.length) return tx.products;
  if (tx.product_summary?.trim()) {
    return [{ name: tx.product_summary.trim(), quantity: 1 }];
  }
  return [];
}

export async function runSumUpSync(params: {
  dryRun?: boolean;
  force?: boolean;
  lockOwner?: string;
}): Promise<SumUpSyncResult> {
  const cfg = getSumUpSyncConfig();
  const dryRun = Boolean(params.dryRun);
  const lockOwner = params.lockOwner || `sync-${Date.now()}`;

  const emptyResult = (message: string, skipped = false): SumUpSyncResult => ({
    ok: false,
    dryRun,
    skipped,
    syncRunId: null,
    transactionsFetched: 0,
    transactionsProcessed: 0,
    transactionsSkipped: 0,
    duplicates: 0,
    salesApplied: 0,
    refundsApplied: 0,
    unrecognizedLines: 0,
    recognizedProducts: [],
    unrecognizedProducts: [],
    errors: [],
    message,
  });

  if (!params.force && !dryRun && !cfg.syncEnabled) {
    return emptyResult("SUMUP_SYNC_ENABLED=false — synchronisation désactivée", true);
  }

  if (!isSumUpSyncConfigured()) {
    return emptyResult("SUMUP_API_KEY ou SUMUP_MERCHANT_CODE manquant");
  }

  if (!dryRun) {
    const locked = await acquireLock(lockOwner);
    if (!locked) {
      return emptyResult("Synchronisation déjà en cours (verrou actif)", true);
    }
  }

  const running = await prisma.syncRun.findFirst({
    where: { source: SOURCE, status: "RUNNING" },
  });
  if (running && !dryRun) {
    await releaseLock(lockOwner);
    return emptyResult("Un SyncRun sumup_api est déjà en cours", true);
  }

  const syncRun = dryRun
    ? null
    : await prisma.syncRun.create({
        data: {
          source: SOURCE,
          locationCode: GLOBAL_STOCK_CODE,
          dryRun: false,
          status: "RUNNING",
        },
      });

  const stats = {
    transactionsFetched: 0,
    transactionsProcessed: 0,
    transactionsSkipped: 0,
    duplicates: 0,
    salesApplied: 0,
    refundsApplied: 0,
    unrecognizedLines: 0,
    recognizedProducts: [] as string[],
    unrecognizedProducts: [] as string[],
    errors: [] as string[],
  };

  try {
    await ensureGlobalStockLocation();
    const state = await ensureSyncState();
    const overlapMs = cfg.syncOverlapMinutes * 60 * 1000;
    const oldestTime = state.lastTransactionTime
      ? new Date(state.lastTransactionTime.getTime() - overlapMs)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const { items } = await listTransactionHistory({ oldestTime, limit: 100 });
    stats.transactionsFetched = items.length;

    const catalog = await loadCatalogCandidates();
    let latestTime = state.lastTransactionTime;

    for (const item of items) {
      const txnId = resolveTransactionId(item);
      if (!txnId) {
        stats.transactionsSkipped++;
        continue;
      }

      if (!dryRun) {
        const already = await prisma.sumUpSyncedTransaction.findUnique({
          where: { sumupTransactionId: txnId },
        });
        if (already) {
          stats.duplicates++;
          continue;
        }
      }

      const full = await fetchTransactionDetails(item);
      const lines = extractProductLines(full);
      const isRefund = isRefundTransaction(full);
      const isSale = isSuccessfulSale(full);

      if (!isSale && !isRefund) {
        stats.transactionsSkipped++;
        if (!dryRun && syncRun) {
          await prisma.sumUpSyncedTransaction.create({
            data: {
              sumupTransactionId: txnId,
              transactionCode: item.transaction_code || null,
              transactionType: full.type || "UNKNOWN",
              processingStatus: "skipped",
              syncRunId: syncRun.id,
              notes: `Statut ignoré: ${full.simple_status || full.status}`,
            },
          });
        }
        continue;
      }

      let linesProcessed = 0;
      let linesSkipped = 0;
      let applyFailures = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const qty = Math.max(1, Math.floor(line.quantity ?? 1));
        const match = matchSumUpProductLine(line, catalog);

        if (!match.productId || match.decision !== "AUTO") {
          linesSkipped++;
          stats.unrecognizedLines++;
          if (match.sourceName) stats.unrecognizedProducts.push(match.sourceName);
          if (!dryRun && syncRun && match.sourceName) {
            await prisma.productMatch.create({
              data: {
                sourceType: SOURCE,
                sourceProductId: txnId,
                sourceName: match.sourceName,
                normalizedSourceName: normalizeProductName(match.sourceName),
                matchMethod: match.method || null,
                confidenceScore: match.confidence ?? null,
                status: "UNMATCHED",
                locationCode: GLOBAL_STOCK_CODE,
                syncRunId: syncRun.id,
                payloadSafe: JSON.stringify(
                  safeLogPayload({
                    quantity: qty,
                    transactionId: txnId,
                  })
                ),
              },
            });
            await prisma.syncError.create({
              data: {
                syncRunId: syncRun.id,
                sourceReference: txnId,
                errorType: "UNMATCHED_PRODUCT",
                errorMessage: `Ligne SumUp non reconnue: ${match.sourceName}`,
                payloadSafe: match.sourceName.slice(0, 200),
              },
            });
          }
          continue;
        }

        stats.recognizedProducts.push(match.sourceName);
        const extRef = `sumup:${isRefund ? "refund" : "sale"}:${txnId}:${match.productId}:${i}`;

        if (dryRun) {
          linesProcessed++;
          if (isRefund) stats.refundsApplied++;
          else stats.salesApplied++;
          continue;
        }

        const result = isRefund
          ? await applyGlobalRefund({
              productId: match.productId,
              quantity: qty,
              externalReference: extRef,
              source: SOURCE,
            })
          : await applyGlobalSale({
              productId: match.productId,
              quantity: qty,
              externalReference: extRef,
              source: SOURCE,
            });

        if (result.duplicate) stats.duplicates++;
        else if (result.ok) {
          linesProcessed++;
          if (isRefund) stats.refundsApplied++;
          else stats.salesApplied++;

          await prisma.product.update({
            where: { id: match.productId },
            data: { sumupLastSync: new Date() },
          });
        } else {
          applyFailures++;
          stats.errors.push(`${txnId}/${match.sourceName}: ${result.message}`);
        }
      }

      // Ne fige pas la transaction si une ligne reconnue a échoué → retry au prochain passage
      if (!dryRun && syncRun && applyFailures === 0) {
        await prisma.sumUpSyncedTransaction.create({
          data: {
            sumupTransactionId: txnId,
            transactionCode: item.transaction_code || null,
            transactionType: isRefund ? "REFUND" : "PAYMENT",
            processingStatus: linesProcessed > 0 ? "applied" : "skipped",
            syncRunId: syncRun.id,
            linesProcessed,
            linesSkipped,
            notes: JSON.stringify(
              safeLogPayload({
                status: full.simple_status || full.status,
                lineCount: lines.length,
              })
            ),
          },
        });
      }

      stats.transactionsProcessed++;

      const ts = item.timestamp ? new Date(item.timestamp) : null;
      if (ts && (!latestTime || ts > latestTime)) {
        latestTime = ts;
      }
    }

    let catalogExport: { magasin: string; ava: string } | undefined;
    if (!dryRun) {
      const exported = await exportOfficialCatalogues();
      catalogExport = { magasin: exported.magasin.path, ava: exported.ava.path };

      await prisma.sumUpSyncState.update({
        where: { id: "default" },
        data: {
          lastSuccessfulSyncAt: new Date(),
          lastTransactionTime: latestTime || state.lastTransactionTime,
          lastTransactionId: items[0] ? resolveTransactionId(items[0]) : state.lastTransactionId,
        },
      });
    }

    if (syncRun) {
      await prisma.syncRun.update({
        where: { id: syncRun.id },
        data: {
          status: stats.errors.length ? "PARTIAL" : "SUCCESS",
          completedAt: new Date(),
          importedCount: stats.transactionsFetched,
          updatedCount: stats.salesApplied + stats.refundsApplied,
          unchangedCount: stats.duplicates,
          unmatchedCount: stats.unrecognizedLines,
          errorCount: stats.errors.length,
          reportJson: JSON.stringify(
            safeLogPayload({
              ...stats,
              catalogExport,
            })
          ),
        },
      });
    }

    const result: SumUpSyncResult = {
      ok: stats.errors.length === 0,
      dryRun,
      skipped: false,
      syncRunId: syncRun?.id ?? null,
      ...stats,
      catalogExport,
      message: dryRun
        ? `Dry-run : ${stats.transactionsFetched} transactions, ${stats.salesApplied} ventes simulées, ${stats.refundsApplied} remboursements simulés`
        : `Sync terminée : ${stats.salesApplied} ventes, ${stats.refundsApplied} remboursements, ${stats.duplicates} doublons ignorés`,
    };

    if (!dryRun) {
      try {
        writeSumUpSyncReport(result);
      } catch (reportErr) {
        stats.errors.push(
          `rapport: ${reportErr instanceof Error ? reportErr.message : String(reportErr)}`
        );
      }
    }

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    stats.errors.push(msg);
    if (syncRun) {
      await prisma.syncRun.update({
        where: { id: syncRun.id },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorCount: 1,
          errorSummary: msg,
        },
      });
    }
    return {
      ok: false,
      dryRun,
      skipped: false,
      syncRunId: syncRun?.id ?? null,
      ...stats,
      message: msg,
    };
  } finally {
    if (!dryRun) await releaseLock(lockOwner);
  }
}
