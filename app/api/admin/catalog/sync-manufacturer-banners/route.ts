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
        sample: planned.slice(0, 10),
      });
    }

    let upserted = 0;
    for (const p of planned) {
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
      });
      if (!mfr) continue;
      await prisma.brand.upsert({
        where: { slug: p.slug },
        create: {
          name: p.name,
          slug: p.slug,
          manufacturerId: mfr.id,
          isActive: true,
        },
        update: {
          name: p.name,
          manufacturerId: mfr.id,
          isActive: true,
        },
      });
      upserted += 1;
    }

    const manufacturers = await prisma.manufacturer.count();
    return NextResponse.json({
      ok: true,
      dryRun: false,
      upserted,
      manufacturersTotal: manufacturers,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
