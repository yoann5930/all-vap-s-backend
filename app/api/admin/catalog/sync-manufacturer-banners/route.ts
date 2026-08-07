/**
 * Sync Manufacturer + Brand depuis le manifest bannières e-liquides.
 * Auth : x-inventory-sync-secret
 * Body : { apply?: boolean } — dry-run par défaut
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { handleApiError } from "@/lib/api-utils";
import prisma from "@/lib/prisma";
import manifest from "@/data/catalog/eliquide-manufacturer-banners.json";

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

type BannerEntry = { slug: string; banner: string; mode: string };

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

    // Schéma additif minimal si migrations catalogue absentes en prod
    const ddl = [
      `CREATE TABLE IF NOT EXISTS "Manufacturer" (
        "id" TEXT NOT NULL,
        "masterId" TEXT,
        "name" TEXT NOT NULL,
        "slug" TEXT NOT NULL,
        "website" TEXT,
        "officialCatalogUrl" TEXT,
        "country" TEXT,
        "status" TEXT NOT NULL DEFAULT 'a_verifier',
        "verificationStatus" TEXT NOT NULL DEFAULT 'NEEDS_CONFIRMATION',
        "verifiedAt" TIMESTAMP(3),
        "verificationEvidence" TEXT,
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Manufacturer_pkey" PRIMARY KEY ("id")
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "Manufacturer_slug_key" ON "Manufacturer"("slug")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "Manufacturer_masterId_key" ON "Manufacturer"("masterId")`,
      `CREATE TABLE IF NOT EXISTS "Brand" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "slug" TEXT NOT NULL,
        "logoUrl" TEXT,
        "manufacturerId" TEXT,
        "masterId" TEXT,
        "status" TEXT NOT NULL DEFAULT 'a_verifier',
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "Brand_slug_key" ON "Brand"("slug")`,
      `ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "manufacturerId" TEXT`,
      `ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'a_verifier'`,
      `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "manufacturerId" TEXT`,
      `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "brandId" TEXT`,
    ];
    const ddlErrors: string[] = [];
    for (const sql of ddl) {
      try {
        await prisma.$executeRawUnsafe(sql);
      } catch (e) {
        ddlErrors.push(e instanceof Error ? e.message : String(e));
      }
    }

    const banners = ((manifest as { banners?: BannerEntry[] }).banners ||
      []) as BannerEntry[];

    const planned = banners.map((b) => ({
      slug: b.slug,
      name: b.slug
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" "),
      mode: b.mode,
      hasOfficialLogo: b.mode === "logo",
    }));

    // Prefer display names from asset-manquant / known folders when possible
    const nameOverrides: Record<string, string> = {
      "e-tasty": "e.Tasty",
      liquidarom: "Liquidarom",
      "juice-66": "Juice 66",
      swoke: "Swoke",
      "cloud-vapor": "Cloud Vapor",
      "maison-fuel": "Maison Fuel",
      protect: "Protect",
      "vap-air": "Vap Air",
      alfa: "Alfa",
      "t-juice": "T-Juice",
      "tribal-force": "Tribal Force",
      fruizee: "Fruizee",
      "vape-maker": "Vape Maker",
      "aromes-secrets": "Aromes & Secrets",
      "raneki-liquide": "Raneki Liquide",
      "the-fuu": "The FUU",
      airmust: "AirMust",
      "mexican-cartel": "Mexican Cartel",
      "secrets-lab": "Secret's Lab",
      "fruity-cool": "Fruity Cool",
      "vape-city": "Vape City",
      liquideo: "Liquideo",
      "biarritz-lab": "Biarritz Lab",
      guilab: "Guilab",
      "revenge-juices": "Revenge Juices",
      "kf-studio": "KF Studio",
      "big-kawa": "Big Kawa",
      "yum-ebot": "Yum E-Bot",
      avap: "AVAP",
      "eliquid-france": "Eliquid France",
      "vape-47": "Vape 47",
      "le-maudit": "Le Maudit",
    };
    for (const p of planned) {
      if (nameOverrides[p.slug]) p.name = nameOverrides[p.slug]!;
    }

    if (!body.apply) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        planned: planned.length,
        ddlErrors: ddlErrors.slice(0, 10),
        sample: planned.slice(0, 10),
      });
    }

    let upserted = 0;
    const errors: string[] = [];
    for (const p of planned) {
      try {
        await prisma.manufacturer.upsert({
          where: { slug: p.slug },
          create: {
            name: p.name,
            slug: p.slug,
            isActive: true,
            status: p.hasOfficialLogo ? "verifie" : "partiel",
            sortOrder: 100,
          },
          update: {
            name: p.name,
            isActive: true,
            status: p.hasOfficialLogo ? "verifie" : "partiel",
          },
        });
        const mfr = await prisma.manufacturer.findUnique({
          where: { slug: p.slug },
          select: { id: true },
        });
        if (!mfr) {
          errors.push(`${p.slug}: manufacturer missing after upsert`);
          continue;
        }
        await prisma.brand.upsert({
          where: { slug: p.slug },
          create: {
            name: p.name,
            slug: p.slug,
            manufacturerId: mfr.id,
            isActive: true,
            status: p.hasOfficialLogo ? "verifie" : "partiel",
          },
          update: {
            name: p.name,
            manufacturerId: mfr.id,
            isActive: true,
            status: p.hasOfficialLogo ? "verifie" : "partiel",
          },
        });
        upserted += 1;
      } catch (e) {
        errors.push(
          `${p.slug}: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }

    const manufacturers = await prisma.manufacturer.count();
    return NextResponse.json({
      ok: errors.length === 0,
      dryRun: false,
      upserted,
      manufacturersTotal: manufacturers,
      ddlErrors: ddlErrors.slice(0, 10),
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
