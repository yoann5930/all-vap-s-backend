/**
 * Télécharge les logos fabricants depuis leurs sites officiels.
 * Stockage : public/media/manufacturers/{slug}/logo.webp
 *
 * Usage: npx tsx scripts/fetch-manufacturer-logos.ts
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import prisma from "../lib/prisma";

const ROOT = process.cwd();
const OUT_ROOT = path.join(ROOT, "public", "media", "manufacturers");
const UA = "AllVapsCatalogBot/1.0 (+manufacturer logos; local catalog)";

/** Fallbacks connus quand le scrape HTML échoue. */
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
  protect: "https://www.protect.fr/assets/images/logo.png",
};

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

async function downloadLogo(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "image/*,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 200) return null;
    return buf;
  } catch {
    return null;
  }
}

async function saveLogoWebp(input: Buffer, outFile: string): Promise<void> {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  let pipeline = sharp(input).ensureAlpha().resize({
    // Cases catalogue ~280×175 : garder une résolution confortable (pas 120px)
    height: 480,
    width: 960,
    fit: "inside",
    withoutEnlargement: false,
  });

  // Logos noirs sur fond blanc → encre claire + fond transparent (cartes sombres)
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
      if (lum > 210) {
        px[i + 3] = 0;
      } else {
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
    // Variante dédiée UI sombre
    const onDark = outFile.replace(/logo\.webp$/i, "logo-on-dark.webp");
    await sharp(adapted).toFile(onDark);
    return;
  }

  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .webp({ quality: 92 })
    .toFile(outFile);
}

async function main() {
  const manufacturers = await prisma.manufacturer.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true, website: true },
  });

  console.log(`Fabricants: ${manufacturers.length}`);
  let ok = 0;
  let fail = 0;

  for (const m of manufacturers) {
    const outFile = path.join(OUT_ROOT, m.slug, "logo.webp");
    if (fs.existsSync(outFile) && !process.argv.includes("--force")) {
      console.log(`skip ${m.slug}`);
      ok++;
      continue;
    }

    process.stdout.write(`${m.slug} ... `);
    let source =
      KNOWN_LOGOS[m.slug] ||
      (m.website ? await discoverLogoFromSite(m.website) : null);

    if (!source && m.website) {
      // retry homepage root
      try {
        const origin = new URL(m.website).origin + "/";
        source = await discoverLogoFromSite(origin);
      } catch {
        /* ignore */
      }
    }

    if (!source) {
      console.log("no source");
      fail++;
      continue;
    }

    const buf = await downloadLogo(source);
    if (!buf) {
      console.log(`download fail (${source})`);
      fail++;
      continue;
    }

    try {
      await saveLogoWebp(buf, outFile);
      // Keep website if empty
      if (!m.website && source.startsWith("http")) {
        try {
          const origin = new URL(source).origin + "/";
          await prisma.manufacturer.update({
            where: { id: m.id },
            data: { website: origin },
          });
        } catch {
          /* ignore */
        }
      }
      console.log(`ok ← ${source}`);
      ok++;
    } catch (e) {
      console.log("convert fail", e instanceof Error ? e.message : e);
      fail++;
    }
  }

  console.log(`\nDone. ok=${ok} fail=${fail}`);
  console.log(`Dir: ${OUT_ROOT}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
