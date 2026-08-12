/**
 * Backfill sécurisé Product.barcode sur la DB runtime.
 * Auth :
 *  - header `x-inventory-sync-secret` = INVENTORY_STAFF_SYNC_SECRET
 *  - OU JWT ADMIN (session inventaire / admin)
 * Body : { apply?: boolean } — dry-run par défaut
 * Ne touche JAMAIS au stock.
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { handleApiError } from "@/lib/api-utils";
import { runProductBarcodeBackfill } from "@/lib/catalog/backfill-product-barcodes";
import mapJson from "@/data/catalog/sumup-item-barcodes.json";
import { requireAuth } from "@/lib/jwt";

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

async function authorize(request: NextRequest): Promise<
  { ok: true } | { ok: false; status: number; error: string }
> {
  const expected = (process.env.INVENTORY_STAFF_SYNC_SECRET || "").trim();
  const provided =
    request.headers.get("x-inventory-sync-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    null;

  if (expected && expected.length >= 24 && secretOk(provided, expected)) {
    return { ok: true };
  }

  try {
    await requireAuth("ADMIN");
    return { ok: true };
  } catch {
    if (!expected || expected.length < 24) {
      return {
        ok: false,
        status: 503,
        error: "Sync non configuré (INVENTORY_STAFF_SYNC_SECRET) et session ADMIN absente",
      };
    }
    return { ok: false, status: 401, error: "Non autorisé" };
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
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
      stockUntouched: true,
      ...result,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
