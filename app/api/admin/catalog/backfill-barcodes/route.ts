/**
 * Backfill sécurisé Product.barcode sur la DB runtime.
 * Auth : header `x-inventory-sync-secret` = INVENTORY_STAFF_SYNC_SECRET
 * Body : { apply?: boolean } — dry-run par défaut
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { handleApiError } from "@/lib/api-utils";
import { runProductBarcodeBackfill } from "@/lib/catalog/backfill-product-barcodes";
import mapJson from "@/data/catalog/sumup-item-barcodes.json";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  apply: z.boolean().optional().default(false),
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

    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const payload = mapJson as {
      map?: Record<string, string>;
      nameMap?: Record<string, string>;
    };
    const sumupItemBarcodes = payload.map || {};
    const sumupNameBarcodes = payload.nameMap || {};

    const result = await runProductBarcodeBackfill({
      apply: body.apply === true,
      sumupItemBarcodes,
      sumupNameBarcodes,
    });

    return NextResponse.json({
      ok: true,
      mapCount: Object.keys(sumupItemBarcodes).length,
      nameMapCount: Object.keys(sumupNameBarcodes).length,
      ...result,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
