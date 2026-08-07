/**
 * Pipeline : SumUp e-liquides → fabricants → bannières 1600×1000 → manifest catalogue.
 *
 * - Logo officiel existant → composé centré (jamais étiré)
 * - Logo absent → bannière typographique + marqueur ASSET_MANQUANT (pas de faux logo)
 * - Ne crée PAS de bannière pour les entrées A_VALIDER
 *
 * Usage :
 *   npx tsx scripts/sync-sumup-eliquide-manufacturer-banners.ts
 *   npx tsx scripts/sync-sumup-eliquide-manufacturer-banners.ts --apply-db
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  analyzeSumUpEliquideManufacturers,
  hasOfficialLogo,
  hasManufacturerBanner,
  manufacturersMissingBanners,
  type DetectedManufacturer,
} from "../lib/catalog/sumup-eliquide-manufacturers";
import { slugify } from "../lib/utils";

const ROOT = process.cwd();
const MEDIA = path.join(ROOT, "public", "media", "manufacturers");
const MANIFEST = path.join(ROOT, "data", "catalog", "eliquide-manufacturer-banners.json");
const REPORT = path.join(ROOT, "rapports", "eliquide-manufacturer-banners-latest.json");
const APPLY_DB = process.argv.includes("--apply-db");

const BANNER_W = 1600;
const BANNER_H = 1000;

function findLogoFile(slug: string): string | null {
  const dir = path.join(MEDIA, slug);
  for (const f of ["logo-on-dark.webp", "logo.webp", "logo.png", "logo.svg"]) {
    const p = path.join(dir, f);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function renderBannerWithLogo(logoPath: string, outPath: string): Promise<void> {
  const maxLogoW = Math.round(BANNER_W * 0.72);
  const maxLogoH = Math.round(BANNER_H * 0.55);
  const logoBuf = await sharp(logoPath)
    .ensureAlpha()
    .resize({
      width: maxLogoW,
      height: maxLogoH,
      fit: "inside",
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
  const meta = await sharp(logoBuf).metadata();
  const lw = meta.width || maxLogoW;
  const lh = meta.height || maxLogoH;
  const left = Math.round((BANNER_W - lw) / 2);
  const top = Math.round((BANNER_H - lh) / 2);

  const bg = await sharp({
    create: {
      width: BANNER_W,
      height: BANNER_H,
      channels: 3,
      background: { r: 16, g: 23, b: 32 },
    },
  })
    .png()
    .toBuffer();

  // Fine brand accent line
  const accent = await sharp({
    create: {
      width: BANNER_W,
      height: 4,
      channels: 3,
      background: { r: 45, g: 212, b: 191 },
    },
  })
    .png()
    .toBuffer();

  await sharp(bg)
    .composite([
      { input: accent, top: 0, left: 0 },
      { input: logoBuf, top, left },
    ])
    .webp({ quality: 90 })
    .toFile(outPath);
}

async function renderTypographicBanner(
  name: string,
  outPath: string,
  missingAsset: boolean
): Promise<void> {
  const safe = name
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const badge = ""; // ASSET_MANQUANT tracé dans ASSET_MANQUANT.json, pas sur l’image publique

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${BANNER_W}" height="${BANNER_H}" viewBox="0 0 ${BANNER_W} ${BANNER_H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#101720"/>
  <rect x="0" y="0" width="100%" height="4" fill="#2DD4BF"/>
  <text x="50%" y="52%" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="72" fill="#F3F4F6">${safe}</text>
  <!-- Sous-titre volumes injecté dynamiquement sur /e-liquides (pas de texte statique ALL VAP'S) -->
  ${badge}
</svg>`;

  await sharp(Buffer.from(svg)).webp({ quality: 90 }).toFile(outPath);
}

async function ensureBanner(m: DetectedManufacturer): Promise<{
  slug: string;
  banner: string;
  mode: "logo" | "typography_asset_manquant";
}> {
  const dir = path.join(MEDIA, m.slug);
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, "banner.webp");
  const logo = findLogoFile(m.slug);

  if (logo) {
    await renderBannerWithLogo(logo, out);
    return { slug: m.slug, banner: `/media/manufacturers/${m.slug}/banner.webp`, mode: "logo" };
  }

  await renderTypographicBanner(m.name, out, true);
  fs.writeFileSync(
    path.join(dir, "ASSET_MANQUANT.json"),
    JSON.stringify(
      {
        slug: m.slug,
        name: m.name,
        reason: "Aucun logo officiel exploitable dans public/media/manufacturers",
        bannerIsTypographicOnly: true,
        generatedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    "utf8"
  );
  return {
    slug: m.slug,
    banner: `/media/manufacturers/${m.slug}/banner.webp`,
    mode: "typography_asset_manquant",
  };
}

async function applyDb(confirmed: DetectedManufacturer[]) {
  const { default: prisma } = await import("../lib/prisma");
  let upserted = 0;
  for (const m of confirmed) {
    const slug = m.slug || slugify(m.name);
    await prisma.manufacturer.upsert({
      where: { slug },
      create: {
        name: m.name,
        slug,
        isActive: true,
        status: m.hasOfficialLogo ? "verifie" : "partiel",
        sortOrder: 100,
      },
      update: {
        name: m.name,
        isActive: true,
        status: m.hasOfficialLogo ? "verifie" : "partiel",
      },
    });

    const mfr = await prisma.manufacturer.findUnique({ where: { slug } });
    if (!mfr) continue;

    await prisma.brand.upsert({
      where: { slug },
      create: {
        name: m.name,
        slug,
        manufacturerId: mfr.id,
        isActive: true,
      },
      update: {
        name: m.name,
        manufacturerId: mfr.id,
        isActive: true,
      },
    });
    upserted += 1;
  }
  await prisma.$disconnect();
  return upserted;
}

async function main() {
  const analysis = analyzeSumUpEliquideManufacturers();
  const confirmed = analysis.manufacturers.filter((m) => m.status !== "A_VALIDER");

  const created: Array<{ slug: string; banner: string; mode: string }> = [];
  for (const m of confirmed) {
    created.push(await ensureBanner(m));
  }

  const missingAfter = manufacturersMissingBanners(analysis);
  const orphanBanners: string[] = [];
  if (fs.existsSync(MEDIA)) {
    for (const d of fs.readdirSync(MEDIA, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      if (!hasManufacturerBanner(d.name)) continue;
      if (!confirmed.some((m) => m.slug === d.name)) {
        // Bannière existante hors liste SumUp confirmée — signaler, ne pas supprimer
        orphanBanners.push(d.name);
      }
    }
  }

  let dbUpserted = 0;
  if (APPLY_DB) {
    dbUpserted = await applyDb(confirmed);
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: analysis.source,
    bannerSize: { width: BANNER_W, height: BANNER_H },
    eliquidesAnalyzed: analysis.eliquidesAnalyzed,
    manufacturersDetected: confirmed.length,
    banners: created,
    assetManquant: analysis.assetManquant,
    aValider: analysis.aValider,
    duplicates: analysis.duplicates,
    productsWithoutManufacturer: analysis.productsWithoutManufacturer,
    missingBannersAfter: missingAfter.map((m) => m.slug),
    orphanBanners,
    dbUpserted,
    pipeline:
      "Produits SumUp → détection fabricant → normalisation → bannière → catalogue",
  };

  fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2), "utf8");
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(
    REPORT,
    JSON.stringify({ analysis, manifest }, null, 2),
    "utf8"
  );

  console.log(
    JSON.stringify(
      {
        eliquidesAnalyzed: analysis.eliquidesAnalyzed,
        manufacturersDetected: confirmed.length,
        bannersCreated: created.length,
        logoMode: created.filter((c) => c.mode === "logo").length,
        typographyAssetManquant: created.filter(
          (c) => c.mode === "typography_asset_manquant"
        ).length,
        assetManquant: analysis.assetManquant,
        aValider: analysis.aValider,
        productsWithoutManufacturer: analysis.productsWithoutManufacturer,
        missingBannersAfter: missingAfter.length,
        orphanBanners: orphanBanners.length,
        dbUpserted,
        manifest: MANIFEST,
        report: REPORT,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
