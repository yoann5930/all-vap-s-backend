/**
 * Bootstrap + publication e-liquides sûrs en prod :
 * 1) Crée les ProductRange pour chaque cover officielle présente en assets
 * 2) Rattache les produits SumUp via tokens certains
 * 3) Confirme OFFICIAL_CONFIRMED + publie visibleOnline
 * Auth: x-inventory-sync-secret
 * POST { apply?: boolean }
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  apply: z.boolean().optional().default(false),
});

const EXCLUDE_CONFIRM = new Set(["the-fuu/cloud-empire-the-fuu"]);

/** Tokens SumUp → slug couverture (certains uniquement). */
const CERTAIN_RANGE_TOKENS: Record<
  string,
  Array<{ token: string; rangeSlug: string }>
> = {
  "e-tasty": [
    { token: "inspiration", rangeSlug: "inspiration" },
    { token: "bankiz", rangeSlug: "bankiz" },
    { token: "godfallcity", rangeSlug: "god-fall-city" },
    { token: "god fall city", rangeSlug: "god-fall-city" },
    { token: "freezy crush", rangeSlug: "freezy-crush" },
    { token: "gang organise", rangeSlug: "gang-organise" },
    { token: "smoke wars", rangeSlug: "smoke-wars" },
    { token: "one taste", rangeSlug: "one-taste" },
    { token: "twenty", rangeSlug: "twenty" },
    { token: "letters", rangeSlug: "letters" },
    { token: "numbers", rangeSlug: "numbers" },
  ],
  liquidarom: [
    { token: "ice cool x", rangeSlug: "ice-cool-x" },
    { token: "ice cool", rangeSlug: "ice-cool" },
    { token: "les collegues", rangeSlug: "les-collegues" },
    { token: "les essentiels", rangeSlug: "les-essentiels" },
  ],
  "biarritz-lab": [
    { token: "fruit defendu", rangeSlug: "le-fruit-defendu" },
    { token: "le fruit defendu", rangeSlug: "le-fruit-defendu" },
    { token: "double dragon", rangeSlug: "double-dragon" },
    { token: "mamita", rangeSlug: "mamita" },
  ],
  airmust: [
    { token: "ferox", rangeSlug: "ferox-airmust" },
    { token: "press start", rangeSlug: "press-start-airmust" },
    { token: "unik", rangeSlug: "unik-airmust" },
    { token: "blue hopper", rangeSlug: "blue-hopper-airmust" },
  ],
  swoke: [
    { token: "force vape", rangeSlug: "force-vape-swoke" },
    { token: "bisou", rangeSlug: "bisou-swoke" },
    { token: "saint flava", rangeSlug: "saint-flava-swoke" },
  ],
  "cloud-vapor": [
    { token: "grand taste city", rangeSlug: "grand-taste-city-cloud-vapor" },
  ],
  "vape-47": [
    { token: "furiosa", rangeSlug: "furiosa-eggz" },
    { token: "les fruits d enfer", rangeSlug: "les-fruits-d-enfer" },
    { token: "fruits d enfer", rangeSlug: "les-fruits-d-enfer" },
    { token: "enfer", rangeSlug: "enfer" },
  ],
  "liquide-lab": [
    { token: "kuix", rangeSlug: "kuix" },
    { token: "glagla", rangeSlug: "glagla" },
    { token: "iceberg", rangeSlug: "iceberg" },
    { token: "peche gourmand", rangeSlug: "peche-gourmand" },
    { token: "péché gourmand", rangeSlug: "peche-gourmand" },
  ],
  "eliquid-france": [
    { token: "fruizee max", rangeSlug: "fruizee-max-eliquid-france" },
    { token: "mintaia", rangeSlug: "mintaia-eliquid-france" },
    { token: "lemon time", rangeSlug: "lemon-time-eliquid-france" },
  ],
  "aromes-secrets": [
    { token: "mythologie", rangeSlug: "mythologie-aromes-secrets" },
  ],
  avap: [{ token: "devil", rangeSlug: "devil-avap" }],
  "juice-66": [{ token: "66 juice", rangeSlug: "66-juice-juice-66" }],
  liquideo: [
    { token: "dragonz", rangeSlug: "dragonzz-liquideo" },
    { token: "dragonzz", rangeSlug: "dragonzz-liquideo" },
  ],
  "t-juice": [
    { token: "t juice", rangeSlug: "t-juice-50-ml" },
    { token: "tjuice", rangeSlug: "t-juice-50-ml" },
  ],
  "cookin-cloud": [{ token: "myst", rangeSlug: "myst" }],
};

const RANGE_DISPLAY_NAMES: Record<string, string> = {
  "blue-hopper-airmust": "Blue Hopper",
  "ferox-airmust": "Ferox",
  "press-start-airmust": "Press Start",
  "unik-airmust": "UNIK",
  "mythologie-aromes-secrets": "Mythologie",
  "devil-avap": "Devil",
  "double-dragon": "Double Dragon",
  "le-fruit-defendu": "Le Fruit Défendu",
  mamita: "Mamita",
  "grand-taste-city-cloud-vapor": "Grand Taste City",
  myst: "Myst",
  bankiz: "Bankiz",
  "freezy-crush": "Freezy Crush",
  "gang-organise": "Gang Organisé",
  "god-fall-city": "God Fall City",
  inspiration: "Inspiration",
  letters: "Letters",
  numbers: "Numbers",
  "one-taste": "One Taste",
  "smoke-wars": "Smoke Wars",
  twenty: "Twenty",
  "fruizee-max-eliquid-france": "Fruizee Max",
  "lemon-time-eliquid-france": "Lemon Time",
  "mintaia-eliquid-france": "Mintaia",
  "66-juice-juice-66": "66 Juice",
  "ice-cool": "Ice Cool",
  "ice-cool-x": "Ice Cool X",
  "les-collegues": "Les Collègues",
  "les-essentiels": "Les Essentiels",
  "big-kawa": "Big Kawa",
  glagla: "GlaGla",
  iceberg: "Iceberg",
  kuix: "Kuix",
  "peche-gourmand": "Péché Gourmand",
  "dragonzz-liquideo": "Dragonzz",
  "evolution-liquideo": "Evolution",
  "freeze-liquideo": "Freeze",
  "bisou-swoke": "Bisou",
  "force-vape-swoke": "Force Vape",
  "saint-flava-swoke": "Saint Flava",
  "t-juice-50-ml": "T-Juice 50 ml",
  "cloud-empire-the-fuu": "Cloud Empire",
  enfer: "Enfer",
  "furiosa-eggz": "Furiosa Eggz",
  "les-fruits-d-enfer": "Les Fruits d'Enfer",
};

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

function newId(): string {
  return `c${randomBytes(12).toString("hex")}`;
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleFromSlug(slug: string, mfrSlug: string): string {
  if (RANGE_DISPLAY_NAMES[slug]) return RANGE_DISPLAY_NAMES[slug]!;
  let base = slug;
  if (base.endsWith(`-${mfrSlug}`)) {
    base = base.slice(0, -(mfrSlug.length + 1));
  }
  return base
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function listCoverRanges(): Array<{ mfrSlug: string; rangeSlug: string }> {
  const root = path.join(process.cwd(), "public", "media", "manufacturers");
  if (!fs.existsSync(root)) return [];
  const out: Array<{ mfrSlug: string; rangeSlug: string }> = [];
  for (const mfr of fs.readdirSync(root, { withFileTypes: true })) {
    if (!mfr.isDirectory()) continue;
    const rangesDir = path.join(root, mfr.name, "ranges");
    if (!fs.existsSync(rangesDir)) continue;
    for (const f of fs.readdirSync(rangesDir)) {
      if (!/\.(webp|jpe?g|png)$/i.test(f)) continue;
      if (/\.OLD|bak/i.test(f)) continue;
      const rangeSlug = f.replace(/\.(webp|jpe?g|png)$/i, "");
      out.push({ mfrSlug: mfr.name, rangeSlug });
    }
  }
  return out;
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
    const covers = listCoverRanges();

    const mfrCount = await prisma.$queryRawUnsafe<Array<{ c: number }>>(
      `SELECT COUNT(*)::int AS c FROM "Manufacturer" WHERE "isActive"=true`
    );
    const productCount = await prisma.$queryRawUnsafe<Array<{ c: number }>>(
      `SELECT COUNT(*)::int AS c FROM "Product"`
    );
    const rangeCount = await prisma.$queryRawUnsafe<Array<{ c: number }>>(
      `SELECT COUNT(*)::int AS c FROM "ProductRange"`
    );
    const linkedCount = await prisma.$queryRawUnsafe<Array<{ c: number }>>(
      `SELECT COUNT(*)::int AS c FROM "Product" WHERE "rangeId" IS NOT NULL`
    );

    if (!body.apply) {
      let probe: Record<string, unknown> | null = null;
      let probeError: string | null = null;
      try {
        const m = await prisma.manufacturer.findUnique({
          where: { slug: "e-tasty" },
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            ranges: {
              where: { isActive: true },
              orderBy: { name: "asc" },
              select: {
                id: true,
                name: true,
                slug: true,
                isActive: true,
                verificationStatus: true,
                catalogVisible: true,
                products: {
                  where: {
                    visibleOnline: true,
                    isActive: true,
                    catalogStatus: { in: ["valide", "actif"] },
                  },
                  select: { id: true },
                },
              },
            },
          },
        });
        probe = {
          found: Boolean(m),
          ranges: m?.ranges.length ?? 0,
          withProducts: m?.ranges.filter((r) => r.products.length > 0).length ?? 0,
          sample: (m?.ranges || []).slice(0, 8).map((r) => ({
            slug: r.slug,
            products: r.products.length,
            verificationStatus: r.verificationStatus,
            catalogVisible: r.catalogVisible,
          })),
        };
      } catch (e) {
        probeError = e instanceof Error ? e.message : String(e);
      }

      return NextResponse.json({
        ok: true,
        dryRun: true,
        coverRanges: covers.length,
        manufacturers: mfrCount[0]?.c ?? 0,
        products: productCount[0]?.c ?? 0,
        productRanges: rangeCount[0]?.c ?? 0,
        productsLinked: linkedCount[0]?.c ?? 0,
        sampleCovers: covers.slice(0, 15).map((c) => `${c.mfrSlug}/${c.rangeSlug}`),
        probe,
        probeError,
      });
    }

    let rangesCreated = 0;
    let rangesUpdated = 0;
    let linked = 0;
    let published = 0;
    const byMfr: Record<string, number> = {};
    const errors: string[] = [];

    // Ensure ProductRange DDL columns exist
    const ddl = [
      `CREATE TABLE IF NOT EXISTS "ProductRange" (
        "id" TEXT NOT NULL,
        "brandId" TEXT NOT NULL,
        "manufacturerId" TEXT,
        "name" TEXT NOT NULL,
        "slug" TEXT NOT NULL,
        "masterId" TEXT,
        "formatCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        "status" TEXT NOT NULL DEFAULT 'a_verifier',
        "verificationStatus" TEXT NOT NULL DEFAULT 'NEEDS_CONFIRMATION',
        "officialSourceUrl" TEXT,
        "officialManufacturerUrl" TEXT,
        "verifiedAt" TIMESTAMP(3),
        "verificationEvidence" TEXT,
        "catalogVisible" BOOLEAN NOT NULL DEFAULT false,
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ProductRange_pkey" PRIMARY KEY ("id")
      )`,
      `ALTER TABLE "ProductRange" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'a_verifier'`,
      `ALTER TABLE "ProductRange" ADD COLUMN IF NOT EXISTS "verificationStatus" TEXT NOT NULL DEFAULT 'NEEDS_CONFIRMATION'`,
      `ALTER TABLE "ProductRange" ADD COLUMN IF NOT EXISTS "catalogVisible" BOOLEAN NOT NULL DEFAULT false`,
      `ALTER TABLE "ProductRange" ADD COLUMN IF NOT EXISTS "manufacturerId" TEXT`,
      `ALTER TABLE "ProductRange" ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3)`,
      `ALTER TABLE "ProductRange" ADD COLUMN IF NOT EXISTS "formatCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`,
      `ALTER TABLE "ProductRange" ADD COLUMN IF NOT EXISTS "masterId" TEXT`,
      `ALTER TABLE "ProductRange" ADD COLUMN IF NOT EXISTS "officialSourceUrl" TEXT`,
      `ALTER TABLE "ProductRange" ADD COLUMN IF NOT EXISTS "officialManufacturerUrl" TEXT`,
      `ALTER TABLE "ProductRange" ADD COLUMN IF NOT EXISTS "verificationEvidence" TEXT`,
      `ALTER TABLE "ProductRange" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "ProductRange_brandId_slug_key" ON "ProductRange"("brandId", "slug")`,
    ];
    for (const sql of ddl) {
      try {
        await prisma.$executeRawUnsafe(sql);
      } catch {
        /* ignore */
      }
    }

    for (const cover of covers) {
      const key = `${cover.mfrSlug}/${cover.rangeSlug}`;
      const confirm = !EXCLUDE_CONFIRM.has(key);
      try {
        let mfrRows = await prisma.$queryRawUnsafe<
          Array<{ id: string; name: string }>
        >(`SELECT id, name FROM "Manufacturer" WHERE slug = $1 LIMIT 1`, cover.mfrSlug);
        if (!mfrRows[0]) {
          const mfrName =
            cover.mfrSlug === "liquide-lab"
              ? "Liquide Lab"
              : cover.mfrSlug === "cookin-cloud"
                ? "Cookin'Cloud"
                : cover.mfrSlug
                    .split("-")
                    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(" ");
          const mfrId = newId();
          await prisma.$executeRawUnsafe(
            `INSERT INTO "Manufacturer" (
               id, name, slug, status, "isActive", "sortOrder", "createdAt", "updatedAt"
             ) VALUES ($1, $2, $3, 'partiel', true, 100, NOW(), NOW())
             ON CONFLICT (slug) DO UPDATE SET "isActive" = true, "updatedAt" = NOW()`,
            mfrId,
            mfrName,
            cover.mfrSlug
          );
          mfrRows = await prisma.$queryRawUnsafe<
            Array<{ id: string; name: string }>
          >(`SELECT id, name FROM "Manufacturer" WHERE slug = $1 LIMIT 1`, cover.mfrSlug);
        }
        const mfr = mfrRows[0];
        if (!mfr) {
          errors.push(`no manufacturer: ${cover.mfrSlug}`);
          continue;
        }

        // Brand = same slug as manufacturer (créé par sync-manufacturer-banners)
        let brandRows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM "Brand" WHERE slug = $1 LIMIT 1`,
          cover.mfrSlug
        );
        if (!brandRows[0]) {
          const brandId = newId();
          await prisma.$executeRawUnsafe(
            `INSERT INTO "Brand" (id, name, slug, "isActive", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, true, NOW(), NOW())
             ON CONFLICT (slug) DO NOTHING`,
            brandId,
            mfr.name,
            cover.mfrSlug
          );
          brandRows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT id FROM "Brand" WHERE slug = $1 LIMIT 1`,
            cover.mfrSlug
          );
        }
        const brandId = brandRows[0]?.id;
        if (!brandId) {
          errors.push(`no brand: ${cover.mfrSlug}`);
          continue;
        }

        const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM "ProductRange" WHERE slug = $1 AND "brandId" = $2 LIMIT 1`,
          cover.rangeSlug,
          brandId
        );

        const rangeName = titleFromSlug(cover.rangeSlug, cover.mfrSlug);
        let rangeId = existing[0]?.id;
        if (!rangeId) {
          rangeId = newId();
          await prisma.$executeRawUnsafe(
            `INSERT INTO "ProductRange" (
               id, "brandId", "manufacturerId", name, slug, status,
               "verificationStatus", "catalogVisible", "isActive",
               "sortOrder", "createdAt", "updatedAt", "verifiedAt"
             ) VALUES (
               $1, $2, $3, $4, $5,
               $6, $7, $8, true, 0, NOW(), NOW(), $9
             )`,
            rangeId,
            brandId,
            mfr.id,
            rangeName,
            cover.rangeSlug,
            confirm ? "verifie" : "a_verifier",
            confirm ? "OFFICIAL_CONFIRMED" : "NEEDS_CONFIRMATION",
            confirm,
            confirm ? new Date() : null
          );
          rangesCreated += 1;
        } else {
          await prisma.$executeRawUnsafe(
            `UPDATE "ProductRange"
             SET "manufacturerId" = $1,
                 name = $2,
                 status = CASE WHEN $3 THEN 'verifie' ELSE status END,
                 "verificationStatus" = CASE WHEN $3 THEN 'OFFICIAL_CONFIRMED' ELSE "verificationStatus" END,
                 "catalogVisible" = CASE WHEN $3 THEN true ELSE "catalogVisible" END,
                 "verifiedAt" = CASE WHEN $3 THEN NOW() ELSE "verifiedAt" END,
                 "isActive" = true,
                 "updatedAt" = NOW()
             WHERE id = $4`,
            mfr.id,
            rangeName,
            confirm,
            rangeId
          );
          rangesUpdated += 1;
        }

        // Link products by certain tokens for this manufacturer/range
        const tokens = (CERTAIN_RANGE_TOKENS[cover.mfrSlug] || []).filter(
          (t) => t.rangeSlug === cover.rangeSlug
        );
        for (const t of tokens) {
          const tokenNorm = norm(t.token);
          if (tokenNorm.length < 3) continue;
          // Prefer products already under this manufacturer; also catch mislinked by name
          const candidates = await prisma.$queryRawUnsafe<
            Array<{ id: string; name: string; rangeId: string | null }>
          >(
            `SELECT id, name, "rangeId"
             FROM "Product"
             WHERE ("manufacturerId" = $1 OR "manufacturerId" IS NULL OR name ILIKE '%' || $2 || '%')
               AND name ILIKE '%' || $2 || '%'
             LIMIT 500`,
            mfr.id,
            t.token.replace(/[%_]/g, "")
          );
          for (const p of candidates) {
            if (!norm(p.name).includes(tokenNorm)) continue;
            // Special-case enfer: require vape 47 context when ambiguous
            if (
              t.rangeSlug === "enfer" &&
              !/vape\s*47|enfer/i.test(p.name)
            ) {
              continue;
            }
            if (p.rangeId === rangeId) continue;
            await prisma.$executeRawUnsafe(
              `UPDATE "Product"
               SET "manufacturerId" = $1,
                   "brandId" = $2,
                   brand = $3,
                   "rangeId" = $4,
                   range = $5,
                   "updatedAt" = NOW()
               WHERE id = $6
                 AND ("rangeId" IS NULL OR "rangeId" = $4 OR "manufacturerId" IS DISTINCT FROM $1)`,
              mfr.id,
              brandId,
              mfr.name,
              rangeId,
              rangeName,
              p.id
            );
            linked += 1;
          }
        }

        if (!confirm) continue;

        const pub = await prisma.$executeRawUnsafe(
          `UPDATE "Product"
           SET "visibleOnline" = true,
               "isActive" = true,
               "catalogStatus" = 'valide',
               "updatedAt" = NOW()
           WHERE "rangeId" = $1
             AND "manufacturerId" = $2
             AND (
               "visibleOnline" = false
               OR "isActive" = false
               OR "catalogStatus" NOT IN ('valide', 'actif')
             )`,
          rangeId,
          mfr.id
        );
        const count = typeof pub === "number" ? pub : 0;
        if (count > 0) {
          published += count;
          byMfr[cover.mfrSlug] = (byMfr[cover.mfrSlug] || 0) + count;
        }
      } catch (e) {
        errors.push(
          `${key}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200)
        );
      }
    }

    await prisma.$executeRawUnsafe(
      `UPDATE "Manufacturer"
       SET status = 'partiel'
       WHERE slug = 'cookin-cloud' AND status = 'a_verifier'`
    );
    await prisma.$executeRawUnsafe(
      `UPDATE "Manufacturer" m
       SET status = CASE WHEN m.status = 'a_verifier' THEN 'partiel' ELSE m.status END
       WHERE m.id IN (
         SELECT DISTINCT r."manufacturerId" FROM "ProductRange" r
         WHERE r."verificationStatus" = 'OFFICIAL_CONFIRMED'
           AND r."catalogVisible" = true
           AND r."manufacturerId" IS NOT NULL
       )`
    );

    return NextResponse.json({
      ok: true,
      dryRun: false,
      coverRanges: covers.length,
      rangesCreated,
      rangesUpdated,
      linked,
      published,
      byMfr,
      errors: errors.slice(0, 20),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erreur interne du serveur", detail: message },
      { status: 500 }
    );
  }
}
