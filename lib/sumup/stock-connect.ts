/**
 * Connexion stock + catalogue SumUp ↔ All Vap's — toutes les voies disponibles.
 *
 * SumUp n'expose PAS d'API inventaire/catalogue publique (2026) :
 * - Pull stock : CSV items + API transactions
 * - Push noms/images : CSV outbox à réimporter dans SumUp (obligation)
 *
 * CONTRAT STABLE — ne pas casser :
 * - connectSumUpStock()
 * - npm run sumup:connect-stock
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "@/lib/prisma";
import { GLOBAL_STOCK_CODE } from "@/lib/catalog/normalize";
import { computeAvailable, ensureGlobalStockLocation } from "@/lib/catalog/stock";
import { applySumUpCsvImport } from "@/lib/catalog/sumup-import-service";
import { linkSumUpProductsToCatalogHierarchy } from "@/lib/catalog/link-sumup-hierarchy";
import { isSumUpSyncConfigured, getSumUpSyncConfig } from "@/lib/sumup/config";
import { testSumUpConnection } from "@/lib/sumup/api-client";
import { runSumUpSync, type SumUpSyncResult } from "@/lib/sumup/sync-service";
import {
  pushCatalogToSumUp,
  type SumUpCatalogPushResult,
} from "@/lib/sumup/catalog-push";
import {
  findLatestItemsExportCsv,
  findProcessedInboxByHash,
  recordInboxProcessed,
  sha256Content,
} from "@/lib/sumup/inbox";

export type SumUpStockConnectResult = {
  ok: boolean;
  message: string;
  catalogApiAvailable: false;
  catalogApiNote: string;
  connection: Awaited<ReturnType<typeof testSumUpConnection>> | null;
  mirror: {
    scanned: number;
    createdLevels: number;
    updatedLevels: number;
    unchanged: number;
    unitsMirrored: number;
  };
  csvInbox: {
    file: string | null;
    applied: boolean;
    skippedDuplicate?: boolean;
    fileHash?: string | null;
    message: string;
    updatedCount?: number;
    unmatchedCount?: number;
    syncRunId?: string;
  };
  hierarchy?: {
    scanned: number;
    linkedManufacturer: number;
    linkedRange: number;
  };
  catalogPush: SumUpCatalogPushResult | null;
  transactions: SumUpSyncResult | null;
};

/** @deprecated Prefer import from `@/lib/sumup/inbox` — réexport pour compat. */
export { findLatestItemsExportCsv };

/**
 * Recopie Product/Variant.stock (quantités SumUp déjà en base) vers StockLevel GLOBAL.
 */
export async function mirrorSumUpLinkedStockToLevels(params?: {
  onlyWithSumupId?: boolean;
}): Promise<SumUpStockConnectResult["mirror"]> {
  const onlyWithSumupId = params?.onlyWithSumupId !== false;
  const location = await ensureGlobalStockLocation();

  const products = await prisma.product.findMany({
    where: onlyWithSumupId
      ? {
          OR: [
            { sumupProductId: { not: null } },
            { variants: { some: { sumupProductId: { not: null } } } },
          ],
        }
      : {},
    include: {
      variants: { where: { active: true }, orderBy: { createdAt: "asc" } },
    },
  });

  let createdLevels = 0;
  let updatedLevels = 0;
  let unchanged = 0;
  let unitsMirrored = 0;
  const runStamp = Date.now();

  for (const product of products) {
    let variants = product.variants;
    if (variants.length === 0) {
      const created = await prisma.productVariant.create({
        data: {
          productId: product.id,
          name: "Standard",
          stock: product.stock,
          sumupProductId: product.sumupProductId,
          active: true,
        },
      });
      variants = [created];
    }

    const useProductStock = variants.length === 1;

    for (const variant of variants) {
      const targetQty = Math.max(
        0,
        useProductStock ? product.stock : (variant.stock ?? product.stock ?? 0)
      );

      const existing = await prisma.stockLevel.findUnique({
        where: {
          variantId_locationId: {
            variantId: variant.id,
            locationId: location.id,
          },
        },
      });

      if (!existing) {
        await prisma.stockLevel.create({
          data: {
            productId: product.id,
            variantId: variant.id,
            locationId: location.id,
            quantity: targetQty,
            reservedQuantity: 0,
            availableQuantity: targetQty,
            source: "sumup_mirror",
            lastSyncedAt: new Date(),
          },
        });
        await prisma.stockMovement.create({
          data: {
            productId: product.id,
            variantId: variant.id,
            locationId: location.id,
            movementType: "SYNC_SET",
            quantityBefore: 0,
            quantityChange: targetQty,
            quantityAfter: targetQty,
            source: "sumup_mirror",
            externalReference: `sumup-mirror:${runStamp}:${variant.id}`,
          },
        });
        createdLevels++;
        unitsMirrored += targetQty;
        continue;
      }

      if (existing.quantity === targetQty) {
        unchanged++;
        continue;
      }

      await prisma.stockLevel.update({
        where: { id: existing.id },
        data: {
          quantity: targetQty,
          availableQuantity: computeAvailable(targetQty, existing.reservedQuantity),
          source: "sumup_mirror",
          lastSyncedAt: new Date(),
        },
      });
      await prisma.stockMovement.create({
        data: {
          productId: product.id,
          variantId: variant.id,
          locationId: location.id,
          movementType: "SYNC_SET",
          quantityBefore: existing.quantity,
          quantityChange: targetQty - existing.quantity,
          quantityAfter: targetQty,
          source: "sumup_mirror",
          externalReference: `sumup-mirror:${runStamp}:${variant.id}`,
        },
      });
      updatedLevels++;
      unitsMirrored += targetQty;
    }

    await prisma.product.update({
      where: { id: product.id },
      data: { sumupLastSync: new Date() },
    });
  }

  return {
    scanned: products.length,
    createdLevels,
    updatedLevels,
    unchanged,
    unitsMirrored,
  };
}

async function importLatestInboxCsv(): Promise<SumUpStockConnectResult["csvInbox"]> {
  const file = findLatestItemsExportCsv();
  if (!file) {
    return {
      file: null,
      applied: false,
      message:
        "Aucun CSV SumUp dans inbox_sumup/. Exportez « Articles » depuis SumUp (items-export) et déposez le fichier ici.",
    };
  }

  const csvContent = fs.readFileSync(file, "utf8");
  const fileHash = sha256Content(csvContent);
  const fileName = path.basename(file);

  const already = await findProcessedInboxByHash(fileHash);
  if (already && already.status === "IMPORTED") {
    return {
      file,
      applied: false,
      skippedDuplicate: true,
      fileHash,
      message: `CSV déjà importé (hash ${fileHash.slice(0, 12)}…) — pas de réimport.`,
      syncRunId: already.syncRunId ?? undefined,
    };
  }

  try {
    const result = await applySumUpCsvImport({
      csvContent,
      dryRun: false,
      createUnmatched: false,
      confirmToken: "CONFIRM_SUMUP_IMPORT",
      fileName,
      fileHash,
    });

    await recordInboxProcessed({
      fileName,
      fileHash,
      filePath: file,
      status: "IMPORTED",
      syncRunId: result.syncRunId,
      stats: {
        updated: result.preview.updateCount,
        unmatched: result.preview.unmatchedCount,
        duplicates: result.preview.duplicateCount,
        unchanged: result.preview.unchangedCount,
        created: result.preview.createCount,
      },
    });

    return {
      file,
      applied: result.applied,
      skippedDuplicate: false,
      fileHash,
      message: result.message,
      updatedCount: result.preview.updateCount,
      unmatchedCount: result.preview.unmatchedCount,
      syncRunId: result.syncRunId,
    };
  } catch (e) {
    await recordInboxProcessed({
      fileName,
      fileHash,
      filePath: file,
      status: "FAILED",
      stats: { error: e instanceof Error ? e.message : String(e) },
    });
    throw e;
  }
}

/** Orchestrateur : stock pull + push catalogue noms/images (obligation). */
export async function connectSumUpStock(params?: {
  skipMirror?: boolean;
  skipCsv?: boolean;
  skipTransactions?: boolean;
  skipCatalogPush?: boolean;
  forceTransactions?: boolean;
}): Promise<SumUpStockConnectResult> {
  const cfg = getSumUpSyncConfig();
  const connection = isSumUpSyncConfigured() ? await testSumUpConnection() : null;

  const catalogApiNote =
    "SumUp n'expose pas d'API catalogue publique. Pull stock = CSV + transactions. " +
    "Push noms/images = CSV outbox_sumup (réimport Articles SumUp) — obligatoire.";

  let mirror: SumUpStockConnectResult["mirror"] = {
    scanned: 0,
    createdLevels: 0,
    updatedLevels: 0,
    unchanged: 0,
    unitsMirrored: 0,
  };
  let csvInbox: SumUpStockConnectResult["csvInbox"] = {
    file: null,
    applied: false,
    message: "CSV ignoré",
  };
  let catalogPush: SumUpCatalogPushResult | null = null;
  let transactions: SumUpSyncResult | null = null;
  let hierarchy: SumUpStockConnectResult["hierarchy"] = {
    scanned: 0,
    linkedManufacturer: 0,
    linkedRange: 0,
  };

  await ensureGlobalStockLocation();

  if (!params?.skipCsv) {
    try {
      csvInbox = await importLatestInboxCsv();
    } catch (e) {
      csvInbox = {
        file: findLatestItemsExportCsv(),
        applied: false,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  }

  if (!params?.skipMirror) {
    mirror = await mirrorSumUpLinkedStockToLevels({ onlyWithSumupId: true });
  }

  // Lien Fabricant → Gamme (référentiel existant uniquement, pas d'invention)
  try {
    const link = await linkSumUpProductsToCatalogHierarchy({ onlyMissing: true });
    hierarchy = {
      scanned: link.scanned,
      linkedManufacturer: link.linkedManufacturer,
      linkedRange: link.linkedRange,
    };
  } catch {
    /* non bloquant */
  }

  if (!params?.skipCatalogPush) {
    try {
      catalogPush = await pushCatalogToSumUp({ eliquidesOnly: true });
    } catch (e) {
      catalogPush = {
        ok: false,
        mode: "csv_outbox",
        apiCatalogAvailable: false,
        apiNote: catalogApiNote,
        message: e instanceof Error ? e.message : String(e),
        publicBaseUrl: "",
        imagesPubliclyReachable: false,
        sourceCsv: null,
        outboxCsv: null,
        outboxManifest: null,
        scannedCsvRows: 0,
        matchedProducts: 0,
        nameUpdates: 0,
        imageUpdates: 0,
        skippedNoMatch: 0,
        skippedNoChange: 0,
        rows: [],
        importInstructions: [],
      };
    }
  }

  if (!params?.skipTransactions && isSumUpSyncConfigured()) {
    transactions = await runSumUpSync({
      dryRun: false,
      force: params?.forceTransactions !== false,
      lockOwner: "sumup-stock-connect",
    });
  }

  const ok =
    Boolean(connection?.ok) &&
    (transactions ? transactions.ok : true) &&
    (catalogPush ? catalogPush.ok : true);

  const parts = [
    `Miroir: ${mirror.createdLevels + mirror.updatedLevels} niveaux maj / ${mirror.scanned} produits SumUp`,
    csvInbox.skippedDuplicate
      ? `CSV: déjà importé (hash)`
      : csvInbox.applied
        ? `CSV: ${path.basename(csvInbox.file || "")} (${csvInbox.updatedCount ?? 0} maj)`
        : `CSV: ${csvInbox.file ? "non appliqué" : "absent"}`,
    hierarchy
      ? `Hiérarchie: ${hierarchy.linkedManufacturer} fab / ${hierarchy.linkedRange} gammes`
      : null,
    catalogPush
      ? `Push catalogue: ${catalogPush.nameUpdates} noms / ${catalogPush.imageUpdates} images → outbox`
      : "Push catalogue: ignoré",
    transactions
      ? `API tx: ${transactions.salesApplied} ventes, ${transactions.refundsApplied} remboursements`
      : "API tx: ignorée",
    `Emplacement: ${GLOBAL_STOCK_CODE}`,
    cfg.syncEnabled ? "worker ON" : "worker OFF",
  ].filter(Boolean);

  return {
    ok,
    message: parts.join(" · "),
    catalogApiAvailable: false,
    catalogApiNote,
    connection,
    mirror,
    csvInbox,
    hierarchy,
    catalogPush,
    transactions,
  };
}
