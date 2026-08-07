import prisma from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import {
  isStoreStockCode,
  stockCodeDisplayName,
  type StoreStockCode,
} from "@/lib/catalog/normalize";
import {
  buildSumUpImportPreview,
  mapSumUpCsvRows,
  type SumUpImportPreview,
} from "@/lib/catalog/sumup-csv-import";
import type { CatalogMatchCandidate } from "@/lib/catalog/matching";
import {
  computeAvailable,
  ensureStoreStockLocations,
  getStoreLocationOrThrow,
  syncProductStockMirror,
} from "@/lib/catalog/stock";

export { ensureStoreStockLocations as ensureStockLocations };

async function loadCatalogCandidates(): Promise<CatalogMatchCandidate[]> {
  return prisma.product.findMany({
    select: {
      id: true,
      name: true,
      normalizedName: true,
      sku: true,
      barcode: true,
      sumupProductId: true,
      brand: true,
    },
  });
}

async function loadCurrentQuantities(locationCode: StoreStockCode): Promise<Map<string, number>> {
  const location = await prisma.stockLocation.findUnique({ where: { code: locationCode } });
  if (!location) return new Map();

  const levels = await prisma.stockLevel.findMany({
    where: { locationId: location.id },
    select: { productId: true, quantity: true },
  });

  const map = new Map<string, number>();
  for (const level of levels) {
    if (!map.has(level.productId)) map.set(level.productId, level.quantity);
  }
  return map;
}

function parseLocationCode(raw: string | undefined | null): StoreStockCode {
  if (raw && isStoreStockCode(raw)) return raw;
  throw new Error("locationCode obligatoire : HAUTMONT ou LE_QUESNOY");
}

export async function previewSumUpCsvImport(params: {
  csvContent: string;
  locationCode: StoreStockCode;
}): Promise<SumUpImportPreview & { syncRunId: string }> {
  await ensureStoreStockLocations();
  const locationCode = params.locationCode;
  const catalog = await loadCatalogCandidates();
  const currentQuantities = await loadCurrentQuantities(locationCode);
  const preview = buildSumUpImportPreview({
    csvContent: params.csvContent,
    catalog,
    currentQuantities,
    locationCode,
  });

  const syncRun = await prisma.syncRun.create({
    data: {
      source: "sumup_csv",
      locationCode,
      dryRun: true,
      status: "SUCCESS",
      completedAt: new Date(),
      importedCount: preview.totalRows,
      updatedCount: preview.updateCount,
      unchangedCount: preview.unchangedCount,
      unmatchedCount: preview.unmatchedCount,
      duplicateCount: preview.duplicateCount,
      errorCount: preview.errorCount,
      createCount: preview.createCount,
      reportJson: JSON.stringify({
        detectedColumns: preview.detectedColumns,
        reviewCount: preview.reviewCount,
        locationName: preview.locationName,
      }),
    },
  });

  return { ...preview, syncRunId: syncRun.id };
}

export async function applySumUpCsvImport(params: {
  csvContent: string;
  dryRun: boolean;
  createUnmatched?: boolean;
  confirmToken: string;
  locationCode: StoreStockCode;
}): Promise<{
  applied: boolean;
  dryRun: boolean;
  syncRunId: string;
  preview: SumUpImportPreview;
  message: string;
}> {
  const locationCode = parseLocationCode(params.locationCode);

  if (params.dryRun !== false) {
    const preview = await previewSumUpCsvImport({
      csvContent: params.csvContent,
      locationCode,
    });
    return {
      applied: false,
      dryRun: true,
      syncRunId: preview.syncRunId,
      preview,
      message: "Simulation uniquement — aucune écriture catalogue/stock.",
    };
  }

  if (params.confirmToken !== "CONFIRM_SUMUP_IMPORT") {
    throw new Error("Confirmation invalide. Envoyer confirmToken=CONFIRM_SUMUP_IMPORT.");
  }

  const location = await getStoreLocationOrThrow(locationCode);
  const catalog = await loadCatalogCandidates();
  const currentQuantities = await loadCurrentQuantities(locationCode);
  const preview = buildSumUpImportPreview({
    csvContent: params.csvContent,
    catalog,
    currentQuantities,
    locationCode,
  });

  const { rows: sourceRows } = mapSumUpCsvRows(params.csvContent);
  const byRow = new Map(sourceRows.map((r) => [r.rowIndex, r]));

  const syncRun = await prisma.syncRun.create({
    data: {
      source: "sumup_csv",
      locationCode,
      dryRun: false,
      status: "RUNNING",
    },
  });

  let updated = 0;
  let created = 0;
  let unchanged = 0;
  let errors = 0;

  try {
    for (const plan of preview.rows) {
      if (plan.action === "REVIEW" || plan.action === "DUPLICATE") {
        await prisma.productMatch.create({
          data: {
            sourceType: "sumup_csv",
            sourceName: plan.name,
            normalizedSourceName: plan.normalizedName,
            matchedProductId: plan.matchedProductId,
            matchMethod: plan.matchMethod,
            confidenceScore: plan.confidence,
            status: plan.action === "DUPLICATE" ? "DUPLICATE" : "REVIEW",
            locationCode,
            syncRunId: syncRun.id,
            payloadSafe: JSON.stringify({
              rowIndex: plan.rowIndex,
              barcode: plan.barcode,
              sku: plan.sku,
              quantity: plan.quantity,
              quantityBefore: plan.quantityBefore,
              quantityAfter: plan.quantityAfter,
            }),
          },
        });
        continue;
      }

      if (plan.action === "UNMATCHED") {
        await prisma.productMatch.create({
          data: {
            sourceType: "sumup_csv",
            sourceName: plan.name,
            normalizedSourceName: plan.normalizedName,
            matchMethod: plan.matchMethod,
            confidenceScore: plan.confidence,
            status: "UNMATCHED",
            locationCode,
            syncRunId: syncRun.id,
            payloadSafe: JSON.stringify({
              rowIndex: plan.rowIndex,
              barcode: plan.barcode,
              sku: plan.sku,
              quantity: plan.quantity,
            }),
          },
        });

        if (!params.createUnmatched) continue;

        const src = byRow.get(plan.rowIndex);
        const qty = plan.quantity ?? 0;
        const baseSlug = slugify(plan.name) || `produit-${plan.rowIndex}`;
        let slug = baseSlug;
        let i = 1;
        while (await prisma.product.findUnique({ where: { slug } })) {
          slug = `${baseSlug}-${i++}`;
        }

        const product = await prisma.product.create({
          data: {
            name: plan.name,
            normalizedName: plan.normalizedName,
            slug,
            sku: plan.sku,
            barcode: plan.barcode,
            sumupProductId: src?.sumupProductId || null,
            category: src?.category || "autre",
            brand: src?.brand || null,
            priceCents: src?.priceCents ?? 0,
            stock: qty,
            source: "sumup_csv",
            visibleOnline: false,
            isActive: false,
          },
        });

        const variant = await prisma.productVariant.create({
          data: {
            productId: product.id,
            name: "Standard",
            sku: plan.sku,
            barcode: plan.barcode,
            nicotineMg: plan.specs.nicotineMg,
            capacityMl: plan.specs.capacityMl,
            resistanceOhms: plan.specs.resistanceOhms,
            powerWatts: plan.specs.powerWatts,
          },
        });

        await prisma.stockLevel.create({
          data: {
            productId: product.id,
            variantId: variant.id,
            locationId: location.id,
            quantity: qty,
            reservedQuantity: 0,
            availableQuantity: qty,
            source: "sumup_csv",
            lastSyncedAt: new Date(),
          },
        });

        await prisma.stockMovement.create({
          data: {
            productId: product.id,
            variantId: variant.id,
            locationId: location.id,
            movementType: "IMPORT",
            quantityBefore: 0,
            quantityChange: qty,
            quantityAfter: qty,
            source: "sumup_csv",
            externalReference: `${syncRun.id}:row:${plan.rowIndex}`,
          },
        });

        await syncProductStockMirror(product.id);
        created++;
        continue;
      }

      if (plan.action === "UNCHANGED") {
        unchanged++;
        continue;
      }

      if (plan.action === "UPDATE_STOCK" && plan.matchedProductId && plan.quantity != null) {
        let variant = await prisma.productVariant.findFirst({
          where: { productId: plan.matchedProductId, active: true },
          orderBy: { createdAt: "asc" },
        });
        if (!variant) {
          variant = await prisma.productVariant.create({
            data: {
              productId: plan.matchedProductId,
              name: "Standard",
              sku: plan.sku,
              barcode: plan.barcode,
            },
          });
        }

        const existing = await prisma.stockLevel.findUnique({
          where: {
            variantId_locationId: {
              variantId: variant.id,
              locationId: location.id,
            },
          },
        });

        const before = existing?.quantity ?? 0;
        const after = plan.quantity;
        const reserved = existing?.reservedQuantity ?? 0;
        const available = computeAvailable(after, reserved);

        await prisma.stockLevel.upsert({
          where: {
            variantId_locationId: {
              variantId: variant.id,
              locationId: location.id,
            },
          },
          create: {
            productId: plan.matchedProductId,
            variantId: variant.id,
            locationId: location.id,
            quantity: after,
            reservedQuantity: 0,
            availableQuantity: after,
            source: "sumup_csv",
            lastSyncedAt: new Date(),
          },
          update: {
            quantity: after,
            availableQuantity: available,
            source: "sumup_csv",
            lastSyncedAt: new Date(),
          },
        });

        await prisma.stockMovement.create({
          data: {
            productId: plan.matchedProductId,
            variantId: variant.id,
            locationId: location.id,
            movementType: "SYNC_SET",
            quantityBefore: before,
            quantityChange: after - before,
            quantityAfter: after,
            source: "sumup_csv",
            externalReference: `${syncRun.id}:row:${plan.rowIndex}`,
          },
        });

        const srcUpdate = byRow.get(plan.rowIndex);
        await prisma.product.update({
          where: { id: plan.matchedProductId },
          data: {
            normalizedName: plan.normalizedName,
            ...(plan.barcode ? { barcode: plan.barcode } : {}),
            ...(plan.sku ? { sku: plan.sku } : {}),
            ...(srcUpdate?.sumupProductId
              ? { sumupProductId: srcUpdate.sumupProductId }
              : {}),
          },
        });

        await syncProductStockMirror(plan.matchedProductId);
        updated++;
      }
    }

    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status: "SUCCESS",
        completedAt: new Date(),
        importedCount: preview.totalRows,
        updatedCount: updated,
        createCount: created,
        unchangedCount: unchanged,
        unmatchedCount: preview.unmatchedCount,
        duplicateCount: preview.duplicateCount,
        errorCount: errors + preview.errorCount,
      },
    });
  } catch (err) {
    errors++;
    await prisma.syncError.create({
      data: {
        syncRunId: syncRun.id,
        errorType: "APPLY_FAILED",
        errorMessage: err instanceof Error ? err.message : "Erreur apply",
      },
    });
    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorCount: errors,
        errorSummary: err instanceof Error ? err.message : "Erreur apply",
      },
    });
    throw err;
  }

  return {
    applied: true,
    dryRun: false,
    syncRunId: syncRun.id,
    preview,
    message: `Import appliqué sur ${stockCodeDisplayName(locationCode)} (${locationCode}) : ${updated} maj, ${created} créations, ${unchanged} inchangés.`,
  };
}
