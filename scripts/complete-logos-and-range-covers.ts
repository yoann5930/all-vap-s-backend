/**
 * Obligation : logos fabricants + covers gammes.
 * Complète les manquants depuis sources officielles / packshots déjà en base.
 *
 * Usage:
 *   npx tsx scripts/complete-logos-and-range-covers.ts
 *   npx tsx scripts/complete-logos-and-range-covers.ts --force-logos
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import prisma from "../lib/prisma";
import { manufacturerLogoUrl } from "../lib/catalog/manufacturer-logo";
import { rangeCoverUrl } from "../lib/catalog/range-cover";
import {
  isRangeCatalogEligible,
  readRangeOfficialGate,
} from "../lib/catalog/official-verification";

const ROOT = process.cwd();
const OUT_ROOT = path.join(ROOT, "public", "media", "manufacturers");
const UA = "AllVapsCatalogBot/1.0 (+logos & range covers; official only)";

/** Logos officiels connus (priorité #1 si scrape échoue). */
const KNOWN_LOGOS: Record<string, string> = {
  liquidarom: "https://www.liquidarom.com/img/logo-1708513184.jpg",
  "e-tasty": "https://e-tasty.fr/img/logo-1720713677.jpg",
  "biarritz-lab": "https://biarritz-lab.com/cdn/shop/files/logo_bl_1.png?height=200&v=1764255262",
  // Officiel vape47.com — JAMAIS order.vape47.com/img/logo.jpg (PrestaShop « my store »)
  "vape-47": "https://www.vape47.com/icon.svg",
  "t-juice":
    "https://www.t-juice.com/cdn/shop/files/t-juice-featured-image_a0bf2790-eda0-47b9-9cda-bf208b7e85c1.png?v=1659438058",
  "liquide-lab": "https://liquidelab.com/img/logo.png",
  liquideo: "https://www.liquideo.com/img/cms/logo-liquideo_1.png",
  "cloud-vapor": "https://www.cloud-vapor.com/img/logo.jpg",
  "raneki-liquide": "https://ranekiliquide.odoo.com/web/image/1906-9b941ac9/Logo-Raneki.png",
  airmust: "https://www.airmust.com/img/logo.jpg",
  "cookin-cloud": "https://www.cookincloud.com/assets/images/logo.jpg",
  "eliquid-france": "https://www.eliquid-france.com/img/logo-1737468082.jpg",
  "the-fuu": "https://www.thefuu.com/img/logo.png",
  swoke: "https://swoke.net/img/logo.jpg",
  "juice-66": "https://www.juice66.fr/img/logo.png",
  protect: "https://www.protect.fr/assets/images/logo.png",
  avap: "https://www.avap.fr/img/logo.png",
  fruizee: "https://www.fruizee.fr/img/logo.png",
  "aromes-secrets": "https://www.aromesetsecrets.com/img/logo.jpg",
  "revenge-juices": "https://www.revengejuices.com/img/logo.png",
  guilab: "https://www.guilab.fr/img/logo.png",
};

/** Covers gammes officielles (URL bannière / collection / logo gamme). */
const KNOWN_COVERS: Array<{
  manufacturerSlug: string;
  rangeSlug: string;
  url?: string;
  mosaicUrls?: string[];
}> = [
  {
    manufacturerSlug: "liquide-lab",
    rangeSlug: "big-kawa",
    url: "https://liquidelab.com/img/gamme/Big-Kawa.jpg",
  },
  {
    manufacturerSlug: "liquideo",
    rangeSlug: "dragonzz-liquideo",
    url: "https://www.liquideo.com/img/c/233.jpg",
  },
  {
    manufacturerSlug: "liquideo",
    rangeSlug: "evolution-liquideo",
    url: "https://www.liquideo.com/img/c/74.jpg",
  },
  {
    manufacturerSlug: "liquideo",
    rangeSlug: "freeze-liquideo",
    url: "https://www.liquideo.com/img/c/163.jpg",
  },
  {
    manufacturerSlug: "vape-47",
    rangeSlug: "enfer",
    url: "https://www.vape47.com/images/marques/enfer.webp",
  },
  {
    manufacturerSlug: "vape-47",
    rangeSlug: "les-fruits-d-enfer",
    // Pas d’asset marques dédié lisible → traité par fix-vape47-official-assets.ts
    url: "https://www.vape47.com/images/marques/enfer.webp",
  },
  {
    manufacturerSlug: "vape-47",
    rangeSlug: "furiosa-eggz",
    url: "https://www.vape47.com/images/marques/furiosa-eggz.webp",
  },
  {
    manufacturerSlug: "t-juice",
    rangeSlug: "t-juice-50-ml",
    url: "https://www.t-juice.com/cdn/shop/files/t-juice-featured-image_a0bf2790-eda0-47b9-9cda-bf208b7e85c1.png?v=1659438058",
  },
  {
    manufacturerSlug: "cookin-cloud",
    rangeSlug: "myst",
    url: "https://www.cookincloud.com/assets/images/logo.jpg",
  },
  {
    manufacturerSlug: "eliquid-france",
    rangeSlug: "fruizee-max-eliquid-france",
    url: "https://www.eliquid-france.com/modules/ef_displayranges/images/59f7b70cf9a3e12d283a5a1636488e2ba251c652_Logo-Gammes---Fruizee-Max.png",
  },
  {
    manufacturerSlug: "eliquid-france",
    rangeSlug: "lemon-time-eliquid-france",
    url: "https://www.eliquid-france.com/modules/ef_displayranges/images/e4d9ab689cb58aaf1708d86a895a21849d724c29_Logo_Gammes_Lemon_Time.png",
  },
  {
    manufacturerSlug: "eliquid-france",
    rangeSlug: "mintaia-eliquid-france",
    url: "https://www.eliquid-france.com/modules/ef_displayranges/images/b551288018a2cdf313d530eb5f1ef5665e56cfe2_Logo_Gammes_Mintaia.png",
  },
];

function absUrl(base: string, maybe: string): string | null {
  if (!maybe) return null;
  let u = maybe.trim().replace(/&amp;/g, "&");
  if (u.startsWith("//")) u = `https:${u}`;
  if (u.startsWith("/")) {
    try {
      return new URL(u, base).toString();
    } catch {
      return null;
    }
  }
  if (/^https?:\/\//i.test(u)) return u;
  return null;
}

async function discoverLogoFromSite(website: string): Promise<string | null> {
  try {
    const res = await fetch(website, {
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const patterns = [
      /(?:id|class)=["'][^"']*logo[^"']*["'][^>]*src=["']([^"']+)["']/i,
      /src=["']([^"']+)["'][^>]*(?:id|class)=["'][^"']*logo[^"']*["']/i,
      /src=["']([^"']*logo[^"']*\.(?:png|jpe?g|svg|webp)[^"']*)["']/i,
      /property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
      /content=["']([^"']+)["'][^>]*property=["']og:image["']/i,
      /rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i,
      /href=["']([^"']*logo[^"']*\.(?:png|jpe?g|svg|webp)[^"']*)["']/i,
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (!m?.[1]) continue;
      const abs = absUrl(website, m[1]);
      if (abs && !/\.ico(\?|$)/i.test(abs)) return abs;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function download(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "image/*,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 200 ? buf : null;
  } catch {
    return null;
  }
}

async function saveLogoWebp(input: Buffer, outFile: string) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const pipeline = sharp(input).ensureAlpha().resize({
    height: 480,
    width: 960,
    fit: "inside",
    withoutEnlargement: false,
  });
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  let whiteish = 0;
  let darkish = 0;
  const sampleStep = Math.max(4, Math.floor(data.length / 4 / 2000) * 4);
  for (let i = 0; i < data.length; i += sampleStep) {
    const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    if (lum > 210) whiteish++;
    else if (lum < 90) darkish++;
  }
  const mostlyWhiteBg = whiteish > darkish * 1.2 && whiteish > 20;
  if (mostlyWhiteBg) {
    const px = Buffer.from(data);
    for (let i = 0; i < px.length; i += 4) {
      const lum = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      if (lum > 210) px[i + 3] = 0;
      else {
        px[i] = 245;
        px[i + 1] = 245;
        px[i + 2] = 245;
      }
    }
    const adapted = await sharp(px, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .webp({ quality: 92 })
      .toBuffer();
    await sharp(adapted).toFile(outFile);
    await sharp(adapted).toFile(outFile.replace(/logo\.webp$/i, "logo-on-dark.webp"));
    return;
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .webp({ quality: 92 })
    .toFile(outFile);
}

async function implantOnDarkCase(input: Buffer, outPath: string) {
  const W = 1280;
  const H = 800;
  const bg = await sharp({
    create: { width: W, height: H, channels: 3, background: { r: 11, g: 16, b: 22 } },
  })
    .png()
    .toBuffer();
  const cover = await sharp(input)
    .rotate()
    .resize(W, H, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await sharp(bg)
    .composite([{ input: cover, left: 0, top: 0 }])
    .webp({ quality: 90 })
    .toFile(outPath);
}

async function implantMosaic(buffers: Buffer[], outPath: string) {
  const size = 640;
  const resized = await Promise.all(
    buffers.slice(0, 4).map((b) =>
      sharp(b).rotate().resize(size, size, { fit: "cover", position: "centre" }).jpeg({ quality: 88 }).toBuffer()
    )
  );
  while (resized.length < 4) resized.push(resized[resized.length - 1]);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await sharp({
    create: { width: size * 2, height: size * 2, channels: 3, background: { r: 11, g: 16, b: 22 } },
  })
    .composite([
      { input: resized[0], left: 0, top: 0 },
      { input: resized[1], left: size, top: 0 },
      { input: resized[2], left: 0, top: size },
      { input: resized[3], left: size, top: size },
    ])
    .webp({ quality: 90 })
    .toFile(outPath);
}

function resolveLocalImage(imageUrl: string | null | undefined): Buffer | null {
  if (!imageUrl) return null;
  if (imageUrl.startsWith("/media/") || imageUrl.startsWith("media/")) {
    const abs = path.join(ROOT, "public", imageUrl.replace(/^\//, ""));
    if (fs.existsSync(abs)) return fs.readFileSync(abs);
  }
  return null;
}

async function completeLogos(force: boolean) {
  const manufacturers = await prisma.manufacturer.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
  const report: Array<{ slug: string; status: string; source?: string }> = [];

  for (const m of manufacturers) {
    const outFile = path.join(OUT_ROOT, m.slug, "logo.webp");
    if (fs.existsSync(outFile) && !force) {
      report.push({ slug: m.slug, status: "already_present" });
      continue;
    }

    let source =
      KNOWN_LOGOS[m.slug] ||
      (m.website ? await discoverLogoFromSite(m.website) : null);

    if (!source && m.website) {
      try {
        source = await discoverLogoFromSite(new URL(m.website).origin + "/");
      } catch {
        /* ignore */
      }
    }

    // Essayer variantes /img/logo.*
    if (!source && m.website) {
      try {
        const origin = new URL(m.website).origin;
        for (const candidate of [
          `${origin}/img/logo.png`,
          `${origin}/img/logo.jpg`,
          `${origin}/img/logo.webp`,
          `${origin}/logo.png`,
          `${origin}/logo.jpg`,
        ]) {
          const buf = await download(candidate);
          if (buf) {
            await saveLogoWebp(buf, outFile);
            report.push({ slug: m.slug, status: "ok", source: candidate });
            source = "done";
            break;
          }
        }
      } catch {
        /* ignore */
      }
    }
    if (source === "done") continue;

    if (!source) {
      report.push({ slug: m.slug, status: "SOURCE_OFFICIELLE_INTROUVABLE" });
      continue;
    }

    const buf = await download(source);
    if (!buf) {
      report.push({ slug: m.slug, status: "download_fail", source });
      continue;
    }
    try {
      await saveLogoWebp(buf, outFile);
      report.push({ slug: m.slug, status: "ok", source });
    } catch (e) {
      report.push({
        slug: m.slug,
        status: `convert_fail:${e instanceof Error ? e.message : e}`,
        source,
      });
    }
  }
  return report;
}

async function completeCovers() {
  const report: Array<{ key: string; status: string }> = [];

  // 1) Covers connus
  for (const entry of KNOWN_COVERS) {
    const key = `${entry.manufacturerSlug}/${entry.rangeSlug}`;
    const out = path.join(OUT_ROOT, entry.manufacturerSlug, "ranges", `${entry.rangeSlug}.webp`);
    // Remplacer les fallbacks logo si une vraie source est maintenant connue
    const forceReplace = process.argv.includes("--force-covers");
    if (fs.existsSync(out) && !forceReplace) {
      report.push({ key, status: "already_present" });
      continue;
    }
    try {
      if (entry.url) {
        const buf = await download(entry.url);
        if (!buf) {
          report.push({ key, status: `download_fail` });
          continue;
        }
        await implantOnDarkCase(buf, out);
        report.push({ key, status: "ok_url" });
      } else if (entry.mosaicUrls?.length) {
        const bufs: Buffer[] = [];
        for (const u of entry.mosaicUrls) {
          const b = await download(u);
          if (b) bufs.push(b);
        }
        if (bufs.length < 2) {
          report.push({ key, status: "mosaic_fail" });
          continue;
        }
        await implantMosaic(bufs, out);
        report.push({ key, status: "ok_mosaic_url" });
      }
    } catch (e) {
      report.push({ key, status: `err:${e instanceof Error ? e.message : e}` });
    }
  }

  // 2) Gammes publiées sans cover → mosaïque packshots locaux / URL produit
  const ranges = await prisma.productRange.findMany({
    where: { isActive: true },
    include: {
      manufacturer: true,
      products: {
        where: {
          OR: [{ imageUrl: { not: null } }, { visibleOnline: true }],
        },
        select: { imageUrl: true, name: true },
        take: 12,
      },
    },
  });

  for (const r of ranges) {
    const mSlug = r.manufacturer?.slug;
    if (!mSlug) continue;
    const gate = readRangeOfficialGate(r as unknown as Record<string, unknown>);
    const eligible = isRangeCatalogEligible({
      verificationStatus: gate.verificationStatus,
      catalogVisible: gate.catalogVisible,
      isActive: gate.isActive,
      legacyStatus: gate.legacyStatus,
    });
    if (!eligible) continue;
    if (rangeCoverUrl(mSlug, r.slug)) continue;

    const key = `${mSlug}/${r.slug}`;
    const out = path.join(OUT_ROOT, mSlug, "ranges", `${r.slug}.webp`);
    const bufs: Buffer[] = [];

    for (const p of r.products) {
      const local = resolveLocalImage(p.imageUrl);
      if (local) {
        bufs.push(local);
        continue;
      }
      if (p.imageUrl && /^https?:\/\//i.test(p.imageUrl)) {
        const b = await download(p.imageUrl);
        if (b) bufs.push(b);
      }
    }

    if (bufs.length >= 2) {
      await implantMosaic(bufs, out);
      report.push({ key, status: "ok_mosaic_products" });
    } else if (bufs.length === 1) {
      await implantOnDarkCase(bufs[0], out);
      report.push({ key, status: "ok_single_product" });
    } else {
      // Fallback : logo fabricant centré (mieux que case texte seule)
      const logoPath = path.join(OUT_ROOT, mSlug, "logo.webp");
      if (fs.existsSync(logoPath)) {
        await implantOnDarkCase(fs.readFileSync(logoPath), out);
        report.push({ key, status: "ok_fallback_logo" });
      } else {
        report.push({ key, status: "SOURCE_OFFICIELLE_INTROUVABLE" });
      }
    }
  }

  return report;
}

async function main() {
  const force = process.argv.includes("--force-logos");
  console.log("=== Logos fabricants ===");
  const logos = await completeLogos(force);
  for (const r of logos) console.log(`logo ${r.slug}: ${r.status}${r.source ? ` ← ${r.source}` : ""}`);

  console.log("\n=== Covers gammes ===");
  const covers = await completeCovers();
  for (const r of covers) console.log(`cover ${r.key}: ${r.status}`);

  // Re-audit
  const manufacturers = await prisma.manufacturer.findMany({ where: { isActive: true } });
  let logosOk = 0;
  let logosMissing = 0;
  for (const m of manufacturers) {
    if (manufacturerLogoUrl(m.slug)) logosOk++;
    else logosMissing++;
  }

  const ranges = await prisma.productRange.findMany({
    where: { isActive: true },
    include: { manufacturer: true },
  });
  let publishedMissing = 0;
  let coversOk = 0;
  for (const r of ranges) {
    const gate = readRangeOfficialGate(r as unknown as Record<string, unknown>);
    const eligible = isRangeCatalogEligible({
      verificationStatus: gate.verificationStatus,
      catalogVisible: gate.catalogVisible,
      isActive: gate.isActive,
      legacyStatus: gate.legacyStatus,
    });
    if (!eligible) continue;
    if (rangeCoverUrl(r.manufacturer?.slug, r.slug)) coversOk++;
    else publishedMissing++;
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const outDir = path.resolve("data/catalog/yoann");
  fs.mkdirSync(outDir, { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    logos,
    covers,
    summary: { logosOk, logosMissing, coversOkPublished: coversOk, publishedMissingCover: publishedMissing },
  };
  fs.writeFileSync(path.join(outDir, `LOGOS_COVERS_${stamp}.json`), JSON.stringify(payload, null, 2));

  const md = `# Rapport obligation — logos fabricants & covers gammes

Généré : ${payload.generatedAt}

## Obligation

Navigation catalogue **strictement** :

1. \`/e-liquides\` → case **logo fabricant seul**
2. \`/fabricants/[slug]\` → case **visuel / logo de gamme**
3. \`/gammes/[slug]\` → produits

**Ne jamais oublier** : logo fabricant + cover gamme pour toute gamme publiée.

## Synthèse

| Indicateur | Valeur |
| --- | ---: |
| Logos fabricants OK | ${logosOk} |
| Logos manquants | ${logosMissing} |
| Covers gammes publiées OK | ${coversOk} |
| Gammes publiées sans cover | ${publishedMissing} |

## Logos — détail

| Fabricant | Statut | Source |
| --- | --- | --- |
${logos.map((l) => `| ${l.slug} | ${l.status} | ${l.source || "—"} |`).join("\n")}

## Covers — détail

| Gamme | Statut |
| --- | --- |
${covers.map((c) => `| ${c.key} | ${c.status} |`).join("\n")}

## Commandes

\`\`\`bash
npm run logos:manufacturers
npm run catalog:range-covers
npx tsx scripts/complete-logos-and-range-covers.ts
npx tsx scripts/audit-logos-and-range-covers.ts
\`\`\`

Chemins :
- \`public/media/manufacturers/{slug}/logo.webp\`
- \`public/media/manufacturers/{slug}/ranges/{gamme}.webp\`
`;
  fs.writeFileSync(path.resolve("docs/RAPPORT_LOGOS_FABRICANTS_ET_COVERS_GAMMES.md"), md);

  console.log("\n" + JSON.stringify(payload.summary, null, 2));
  console.log("docs/RAPPORT_LOGOS_FABRICANTS_ET_COVERS_GAMMES.md");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
