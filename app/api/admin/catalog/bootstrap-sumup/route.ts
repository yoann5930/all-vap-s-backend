/**
 * Bootstrap catalogue + stock SumUp sur la DB runtime (prod).
 * Auth : header `x-inventory-sync-secret` = INVENTORY_STAFF_SYNC_SECRET
 *
 * Body JSON :
 *  - csvContent: string (CSV SumUp items-export)
 *  - dryRun?: boolean (défaut true)
 *  - createUnmatched?: boolean (défaut false ; true pour créer les manquants)
 *  - confirmToken?: "CONFIRM_SUMUP_IMPORT" (requis si dryRun=false)
 *  - locationCode?: "HAUTMONT" | "LE_QUESNOY" (défaut HAUTMONT)
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { handleApiError } from "@/lib/api-utils";
import {
  HAUTMONT_STOCK_CODE,
  LE_QUESNOY_STOCK_CODE,
} from "@/lib/catalog/normalize";
import {
  applySumUpCsvImport,
  previewSumUpCsvImport,
  ensureStockLocations,
} from "@/lib/catalog/sumup-import-service";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({
  csvContent: z.string().min(20),
  dryRun: z.boolean().optional().default(true),
  createUnmatched: z.boolean().optional().default(false),
  confirmToken: z.string().optional().default(""),
  locationCode: z
    .enum([HAUTMONT_STOCK_CODE, LE_QUESNOY_STOCK_CODE])
    .optional()
    .default(HAUTMONT_STOCK_CODE),
});

function secretOk(provided: string | null, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const expected = (process.env.INVENTORY_STAFF_SYNC_SECRET || "").trim();
    if (!expected || expected.length < 24) {
      return NextResponse.json(
        { error: "Sync non configuré (INVENTORY_STAFF_SYNC_SECRET)" },
        { status: 503 }
      );
    }

    const provided =
      request.headers.get("x-inventory-sync-secret") ||
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
      null;

    if (!secretOk(provided, expected)) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const body = bodySchema.parse(await request.json());
    await ensureStockLocations();

    const before = {
      products: await prisma.product.count(),
      withBarcode: await prisma.product.count({
        where: { AND: [{ barcode: { not: null } }, { NOT: { barcode: "" } }] },
      }),
      stockLevels: await prisma.stockLevel.count(),
    };

    if (body.dryRun !== false) {
      const preview = await previewSumUpCsvImport({
        csvContent: body.csvContent,
        locationCode: body.locationCode,
      });
      const after = before;
      return NextResponse.json({
        ok: true,
        dryRun: true,
        applied: false,
        locationCode: body.locationCode,
        before,
        after,
        preview: {
          totalRows: preview.totalRows,
          createCount: preview.createCount,
          updateCount: preview.updateCount,
          unchangedCount: preview.unchangedCount,
          unmatchedCount: preview.unmatchedCount,
          reviewCount: preview.reviewCount,
          duplicateCount: preview.duplicateCount,
          errorCount: preview.errorCount,
          detectedColumns: preview.detectedColumns,
          syncRunId: preview.syncRunId,
          sampleUnmatched: preview.unmatched.slice(0, 15).map((r) => ({
            name: r.name,
            barcode: r.barcode,
            quantity: r.quantity,
          })),
        },
        message:
          "Simulation — aucune écriture. Relancer avec dryRun=false, createUnmatched=true, confirmToken=CONFIRM_SUMUP_IMPORT.",
      });
    }

    const result = await applySumUpCsvImport({
      csvContent: body.csvContent,
      dryRun: false,
      createUnmatched: body.createUnmatched === true,
      confirmToken: body.confirmToken || "",
      locationCode: body.locationCode,
    });

    const after = {
      products: await prisma.product.count(),
      withBarcode: await prisma.product.count({
        where: { AND: [{ barcode: { not: null } }, { NOT: { barcode: "" } }] },
      }),
      stockLevels: await prisma.stockLevel.count(),
    };

    return NextResponse.json({
      ok: true,
      dryRun: false,
      applied: result.applied,
      locationCode: body.locationCode,
      before,
      after,
      syncRunId: result.syncRunId,
      message: result.message,
      preview: {
        totalRows: result.preview.totalRows,
        createCount: result.preview.createCount,
        updateCount: result.preview.updateCount,
        unchangedCount: result.preview.unchangedCount,
        unmatchedCount: result.preview.unmatchedCount,
        reviewCount: result.preview.reviewCount,
        duplicateCount: result.preview.duplicateCount,
        errorCount: result.preview.errorCount,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
