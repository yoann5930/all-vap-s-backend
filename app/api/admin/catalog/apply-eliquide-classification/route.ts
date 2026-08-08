/**
 * Applique classification e-liquides en prod (sans stocks).
 * Auth: x-inventory-sync-secret
 * POST { apply?: boolean }
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  classifyProductName,
  coverExists,
  titleFromRangeSlug,
} from "@/lib/catalog/eliquide-classification";
import {
  A_CLASSER_NAME,
  A_CLASSER_SLUG,
} from "@/lib/catalog/eliquide-range-tokens";
import { loadKnownManufacturers } from "@/lib/catalog/sumup-eliquide-manufacturers";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  apply: z.boolean().optional().default(false),
  limit: z.number().int().min(1).max(5000).optional().default(2000),
  diag: z.boolean().optional().default(false),
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

async function ensureColumns() {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "classificationStatus" TEXT NOT NULL DEFAULT 'UNCLASSIFIED'`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "classificationSources" TEXT`
  );
}

export async function POST(request: NextRequest) {
  try {
    const expected = (process.env.INVENTORY_STAFF_SYNC_SECRET || "").trim();
    if (!expected || expected.length < 24) {
      return NextResponse.json({ error: "Sync non configuré" }, { status: 503 });
    }
    const provided =
      request.headers.get("x-inventory-sync-secret") ||
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
      null;
    if (!secretOk(provided, expected)) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const body = bodySchema.parse(await request.json().catch(() => ({})));
    await ensureColumns();

    if (body.diag) {
      const ice = await prisma.productRange.findMany({
        where: { slug: "ice-cool" },
        select: {
          id: true,
          manufacturerId: true,
          catalogVisible: true,
          verificationStatus: true,
          manufacturer: { select: { slug: true } },
          _count: {
            select: {
              products: {
                where: {
                  visibleOnline: true,
                  isActive: true,
                  catalogStatus: { in: ["valide", "actif"] },
                },
              },
            },
          },
        },
      });
      const sample = ice[0]
        ? await prisma.product.findMany({
            where: {
              rangeId: ice[0].id,
              visibleOnline: true,
              isActive: true,
              catalogStatus: { in: ["valide", "actif"] },
            },
            select: {
              id: true,
              name: true,
              manufacturerId: true,
              rangeId: true,
              imageUrl: true,
              imageStatus: true,
              classificationStatus: true,
            },
            take: 5,
          })
        : [];
      return NextResponse.json({
        ok: true,
        diag: true,
        iceCoolRanges: ice,
        sample,
        stocksTouched: false,
      });
    }

    const known = loadKnownManufacturers();
    const products = await prisma.product.findMany({
      take: body.limit,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        sumupName: true,
        category: true,
        sku: true,
        barcode: true,
        manufacturerId: true,
        rangeId: true,
        volumeMl: true,
      },
    });

    const preview = products.slice(0, 20).map((p) => {
      const row = classifyProductName({
        rawName: (p.sumupName || p.name || "").trim(),
        category: p.category,
        sku: p.sku,
        barcode: p.barcode,
        known,
      });
      return {
        id: p.id,
        raw: p.sumupName || p.name,
        status: row.classificationStatus,
        mfr: row.manufacturerSlug,
        range: row.rangeSlug,
      };
    });

    if (!body.apply) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        scanned: products.length,
        sample: preview,
        stocksTouched: false,
      });
    }

    let updated = 0;
    for (const p of products) {
      const raw = (p.sumupName || p.name || "").trim();
      if (!raw) continue;
      const row = classifyProductName({
        rawName: raw,
        category: p.category,
        sku: p.sku,
        barcode: p.barcode,
        known,
      });

      let manufacturerId = p.manufacturerId;
      let rangeId = p.rangeId;

      if (row.manufacturerSlug) {
        const mfr = await prisma.manufacturer.upsert({
          where: { slug: row.manufacturerSlug },
          create: {
            name: row.manufacturerName || row.manufacturerSlug,
            slug: row.manufacturerSlug,
            isActive: true,
            status: "partiel",
          },
          update: { isActive: true },
          select: { id: true, slug: true, name: true },
        });
        manufacturerId = mfr.id;

        if (row.rangeSlug) {
          const brand = await prisma.brand.upsert({
            where: { slug: mfr.slug },
            create: {
              name: mfr.name,
              slug: mfr.slug,
              manufacturerId: mfr.id,
              isActive: true,
              status: "partiel",
            },
            update: { manufacturerId: mfr.id, isActive: true },
            select: { id: true },
          });
          const confirm =
            row.classificationStatus === "CONFIRMED" ||
            (row.rangeSlug !== A_CLASSER_SLUG &&
              coverExists(mfr.slug, row.rangeSlug));
          const isAClasser = row.rangeSlug === A_CLASSER_SLUG;
          // Prefer manufacturer-scoped range to avoid slug duplicates across brands.
          const existing =
            (await prisma.productRange.findFirst({
              where: { manufacturerId: mfr.id, slug: row.rangeSlug },
              select: { id: true },
            })) ||
            (await prisma.productRange.findFirst({
              where: { brandId: brand.id, slug: row.rangeSlug },
              select: { id: true },
            }));
          if (existing) {
            rangeId = existing.id;
            if (confirm && !isAClasser) {
              await prisma.productRange.update({
                where: { id: existing.id },
                data: {
                  manufacturerId: mfr.id,
                  verificationStatus: "OFFICIAL_CONFIRMED",
                  catalogVisible: true,
                  status: "verifie",
                },
              });
            } else if (isAClasser) {
              await prisma.productRange.update({
                where: { id: existing.id },
                data: {
                  name: A_CLASSER_NAME,
                  catalogVisible: false,
                  verificationStatus: "NEEDS_CONFIRMATION",
                },
              });
            }
          } else {
            const created = await prisma.productRange.create({
              data: {
                brandId: brand.id,
                manufacturerId: mfr.id,
                name:
                  row.rangeName ||
                  titleFromRangeSlug(row.rangeSlug, mfr.slug),
                slug: row.rangeSlug,
                status: confirm && !isAClasser ? "verifie" : "a_verifier",
                verificationStatus:
                  confirm && !isAClasser
                    ? "OFFICIAL_CONFIRMED"
                    : "NEEDS_CONFIRMATION",
                catalogVisible: confirm && !isAClasser,
                isActive: true,
              },
              select: { id: true },
            });
            rangeId = created.id;
          }
        }
      }

      const volumeMl =
        row.volumeMl && (!p.volumeMl || p.volumeMl <= 0)
          ? row.volumeMl
          : p.volumeMl;

      await prisma.$executeRawUnsafe(
        `UPDATE "Product"
         SET "manufacturerId" = COALESCE($1, "manufacturerId"),
             "rangeId" = COALESCE($2, "rangeId"),
             "volumeMl" = COALESCE($3, "volumeMl"),
             "classificationStatus" = $4,
             "classificationSources" = $5,
             "updatedAt" = NOW()
         WHERE id = $6`,
        manufacturerId,
        rangeId,
        volumeMl,
        row.classificationStatus,
        JSON.stringify({
          sources: row.sources,
          displayName: row.displayName,
          rangeSlug: row.rangeSlug,
          manufacturerSlug: row.manufacturerSlug,
        }),
        p.id
      );
      updated += 1;
    }

    return NextResponse.json({
      ok: true,
      dryRun: false,
      scanned: products.length,
      updated,
      stocksTouched: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erreur interne du serveur", detail: message },
      { status: 500 }
    );
  }
}
