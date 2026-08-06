/**
 * Visuels officiels de gammes (cases catalogue niveau 2) — style Liquide Lab.
 * Stockage : public/media/manufacturers/{fabricant}/ranges/{gamme}.webp
 *
 * Sources = sites fabricants / packshots officiels déjà validés — pas d'invention.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve("public/media/manufacturers");
const PUBLIC = path.resolve("public");

type CoverEntry =
  | { manufacturerSlug: string; rangeSlug: string; url: string; forceCover?: boolean }
  | { manufacturerSlug: string; rangeSlug: string; mosaicUrls: string[] }
  | { manufacturerSlug: string; rangeSlug: string; mosaicLocal: string[] };

const OFFICIAL_RANGE_COVERS: CoverEntry[] = [
  // Liquide Lab
  { manufacturerSlug: "liquide-lab", rangeSlug: "glagla", url: "https://liquidelab.com/img/gamme/Glagla.jpg" },
  { manufacturerSlug: "liquide-lab", rangeSlug: "iceberg", url: "https://liquidelab.com/img/gamme/Iceberg.jpg" },
  { manufacturerSlug: "liquide-lab", rangeSlug: "kuix", url: "https://liquidelab.com/img/gamme/kuix.jpg" },
  {
    manufacturerSlug: "liquide-lab",
    rangeSlug: "peche-gourmand",
    url: "https://liquidelab.com/img/gamme/peche-gourmands.jpg",
  },
  // Biarritz Lab
  {
    manufacturerSlug: "biarritz-lab",
    rangeSlug: "double-dragon",
    url: "https://biarritz-lab.com/cdn/shop/collections/double-dragon.png?v=1764774370",
  },
  {
    manufacturerSlug: "biarritz-lab",
    rangeSlug: "mamita",
    url: "https://biarritz-lab.com/cdn/shop/collections/mamita_1.png?v=1765232291",
  },
  {
    manufacturerSlug: "biarritz-lab",
    rangeSlug: "le-fruit-defendu",
    url: "https://biarritz-lab.com/cdn/shop/collections/cover.png?v=1764776811",
  },
  // e.Tasty — bannières marques
  { manufacturerSlug: "e-tasty", rangeSlug: "bankiz", url: "https://pro.e-tasty.fr/img/2020/brand/44-bankiz.jpg" },
  {
    manufacturerSlug: "e-tasty",
    rangeSlug: "freezy-crush",
    url: "https://pro.e-tasty.fr/img/2020/brand/5-freezycrush.jpg",
  },
  {
    manufacturerSlug: "e-tasty",
    rangeSlug: "inspiration",
    url: "https://pro.e-tasty.fr/img/2020/brand/33-inspiration.jpg",
  },
  {
    manufacturerSlug: "e-tasty",
    rangeSlug: "numbers",
    url: "https://pro.e-tasty.fr/img/2020/brand/marque_page_numbers_700x568.jpg",
  },
  { manufacturerSlug: "e-tasty", rangeSlug: "one-taste", url: "https://pro.e-tasty.fr/img/2020/brand/9-onetaste.jpg" },
  {
    manufacturerSlug: "e-tasty",
    rangeSlug: "smoke-wars",
    url: "https://pro.e-tasty.fr/img/2020/brand/12-smokewars.jpg",
  },
  {
    manufacturerSlug: "e-tasty",
    rangeSlug: "twenty",
    url: "https://pro.e-tasty.fr/modules/ps_imageslider/images/3bd950e4320127cadfa4e160a13299627fc8c4e3_TWENTY-Banniere-Site-Home.png",
  },
  { manufacturerSlug: "e-tasty", rangeSlug: "letters", url: "https://pro.e-tasty.fr/img/2020/marque/m90.png" },
  {
    manufacturerSlug: "e-tasty",
    rangeSlug: "gang-organise",
    url: "https://pro.e-tasty.fr/img/cms/PM_gang-organise.jpg",
  },
  {
    manufacturerSlug: "e-tasty",
    rangeSlug: "god-fall-city",
    mosaicUrls: [
      "https://pro.e-tasty.fr/9863-home_default/adess-100ml-.jpg",
      "https://pro.e-tasty.fr/9869-home_default/dzeus-100ml-.jpg",
      "https://pro.e-tasty.fr/9865-home_default/posei-100ml-.jpg",
      "https://pro.e-tasty.fr/9867-home_default/thena-100ml-.jpg",
    ],
  },
  // Liquidarom — CMS officiel + mosaïques packshots officiels locaux
  {
    manufacturerSlug: "liquidarom",
    rangeSlug: "ice-cool",
    url: "https://liquidarom.com/img/cms/icecool_2.jpg",
  },
  {
    manufacturerSlug: "liquidarom",
    rangeSlug: "les-essentiels",
    url: "https://liquidarom.com/img/cms/essentiel.jpg",
  },
  {
    manufacturerSlug: "liquidarom",
    rangeSlug: "ice-cool-x",
    mosaicLocal: [
      "media/products/liquidarom/ice-cool-x/50ml/blackberry-raspberry.webp",
      "media/products/liquidarom/ice-cool-x/50ml/blue-raspberry-pitaya.webp",
      "media/products/liquidarom/ice-cool-x/50ml/watermelon-lemon.webp",
      "media/products/liquidarom/ice-cool-x/50ml/mixed-red-berries.webp",
    ],
  },
  {
    manufacturerSlug: "liquidarom",
    rangeSlug: "les-collegues",
    mosaicLocal: [
      "media/products/liquidarom/les-collegues/50ml/les-collegues-le-flambeur.webp",
      "media/products/liquidarom/les-collegues/50ml/les-collegues-le-funkie.webp",
      "media/products/liquidarom/les-collegues/50ml/les-collegues-le-chocostar.webp",
      "media/products/liquidarom/les-collegues/50ml/les-collegues-le-tchatcheur.webp",
    ],
  },
  // Vape 47
  {
    manufacturerSlug: "vape-47",
    rangeSlug: "enfer",
    url: "https://order.vape47.com/img/m/188.jpg",
    forceCover: true,
  },
];

async function download(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AllVapsCatalogBot/1.0; +range covers)",
        Accept: "image/*,*/*",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 800 ? buf : null;
  } catch {
    return null;
  }
}

async function implantOnDarkCase(input: Buffer, outPath: string, forceCover = false) {
  const W = 1280;
  const H = 800;
  const meta = await sharp(input).metadata();
  const w = meta.width || 1;
  const h = meta.height || 1;
  const ratio = w / h;
  const isUltraWide = !forceCover && ratio >= 2.4;
  const isLogoLike =
    !forceCover &&
    !isUltraWide &&
    ((meta.format === "png" && ratio > 0.7 && ratio < 1.4 && Math.max(w, h) < 900) ||
      (ratio > 0.85 && ratio < 1.2 && Math.max(w, h) <= 600));

  const bg = await sharp({
    create: { width: W, height: H, channels: 3, background: { r: 11, g: 16, b: 22 } },
  })
    .png()
    .toBuffer();

  const cover = await sharp(input)
    .rotate()
    .resize(
      isUltraWide || isLogoLike ? Math.round(W * 0.92) : W,
      isUltraWide || isLogoLike ? Math.round(H * 0.7) : H,
      {
        fit: isUltraWide || isLogoLike ? "inside" : "cover",
        position: "centre",
        background: { r: 11, g: 16, b: 22, alpha: 1 },
      }
    )
    .png()
    .toBuffer();

  const coverMeta = await sharp(cover).metadata();
  const left = Math.max(0, Math.round((W - (coverMeta.width || W)) / 2));
  const top = Math.max(0, Math.round((H - (coverMeta.height || H)) / 2));

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await sharp(bg)
    .composite([{ input: cover, left, top }])
    .webp({ quality: 90, effort: 5 })
    .toFile(outPath);
}

/** Mosaïque 2×2 style Liquide Lab — images officielles uniquement. */
async function implantMosaic(buffers: Buffer[], outPath: string) {
  const size = 640;
  const resized = await Promise.all(
    buffers.slice(0, 4).map((b) =>
      sharp(b)
        .rotate()
        .resize(size, size, { fit: "cover", position: "centre" })
        .jpeg({ quality: 88 })
        .toBuffer()
    )
  );
  while (resized.length < 4) resized.push(resized[resized.length - 1]);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await sharp({
    create: {
      width: size * 2,
      height: size * 2,
      channels: 3,
      background: { r: 11, g: 16, b: 22 },
    },
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

async function main() {
  const results: Array<{ key: string; ok: boolean; path?: string; error?: string }> = [];

  for (const entry of OFFICIAL_RANGE_COVERS) {
    const key = `${entry.manufacturerSlug}/${entry.rangeSlug}`;
    const out = path.join(ROOT, entry.manufacturerSlug, "ranges", `${entry.rangeSlug}.webp`);
    try {
      if ("url" in entry) {
        const buf = await download(entry.url);
        if (!buf) {
          results.push({ key, ok: false, error: `download_fail ${entry.url}` });
          console.log("fail", key);
          continue;
        }
        await implantOnDarkCase(buf, out, Boolean(entry.forceCover));
      } else if ("mosaicUrls" in entry) {
        const bufs: Buffer[] = [];
        for (const u of entry.mosaicUrls) {
          const b = await download(u);
          if (b) bufs.push(b);
        }
        if (bufs.length < 2) {
          results.push({ key, ok: false, error: "mosaic_download_fail" });
          console.log("fail", key);
          continue;
        }
        await implantMosaic(bufs, out);
      } else {
        const bufs: Buffer[] = [];
        for (const rel of entry.mosaicLocal) {
          const abs = path.join(PUBLIC, rel);
          if (fs.existsSync(abs)) bufs.push(fs.readFileSync(abs));
        }
        if (bufs.length < 2) {
          results.push({ key, ok: false, error: "mosaic_local_missing" });
          console.log("fail", key);
          continue;
        }
        await implantMosaic(bufs, out);
      }
      results.push({ key, ok: true, path: out });
      console.log("ok", key, fs.statSync(out).size);
    } catch (e) {
      results.push({ key, ok: false, error: String(e) });
      console.log("err", key, e);
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: results.every((r) => r.ok),
        done: results.filter((r) => r.ok).length,
        total: results.length,
        results,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
