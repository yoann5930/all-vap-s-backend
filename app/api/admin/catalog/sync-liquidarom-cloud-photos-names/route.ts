/**
 * Applique photos + noms hiérarchie Liquidarom / Cloud Vapor en prod.
 * Auth: x-inventory-sync-secret = INVENTORY_STAFF_SYNC_SECRET
 * POST { apply?: boolean }
 * Ne touche JAMAIS au stock.
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { syncLiquidaromCloudPhotosNames } from "@/lib/catalog/sync-liquidarom-cloud-photos-names";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  apply: z.boolean().optional().default(false),
  /** true = imageUrl uniquement, jamais de rename / stock. */
  photosOnly: z.boolean().optional().default(true),
});

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function checkSecret(req: NextRequest) {
  const expected = (process.env.INVENTORY_STAFF_SYNC_SECRET || "").trim();
  if (!expected) {
    return { ok: false as const, missing: true };
  }
  const got = (req.headers.get("x-inventory-sync-secret") || "").trim();
  if (!got || got.length !== expected.length) return { ok: false as const, missing: false };
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (!timingSafeEqual(a, b)) return { ok: false as const, missing: false };
  return { ok: true as const };
}

export async function POST(request: NextRequest) {
  const auth = checkSecret(request);
  if (auth.missing) {
    return NextResponse.json(
      { error: "Sync non configuré (INVENTORY_STAFF_SYNC_SECRET)" },
      { status: 503 },
    );
  }
  if (!auth.ok) return unauthorized();

  const body = bodySchema.parse(await request.json().catch(() => ({})));
  const report = await syncLiquidaromCloudPhotosNames({
    apply: body.apply,
    photosOnly: body.photosOnly,
  });
  return NextResponse.json(report);
}
