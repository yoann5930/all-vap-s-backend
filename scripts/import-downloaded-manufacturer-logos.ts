/**
 * Import logos fabricants depuis Downloads → public/media/manufacturers/{slug}/logo.webp
 * + régénère banner.webp pour le hub e-liquides.
 *
 * Usage: npx tsx scripts/import-downloaded-manufacturer-logos.ts
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const SRC = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  "Downloads",
  "logo fabricant"
);
const MEDIA = path.join(ROOT, "public", "media", "manufacturers");

const BANNER_W = 1600;
const BANNER_H = 1000;

/** Fichier source → slug catalogue (typos fichiers corrigées). */
const MAP: Array<{ file: string; slug: string; darkBg?: boolean }> = [
  { file: "biaritz lab.avif", slug: "biarritz-lab" },
  { file: "cloud vapor.webp", slug: "cloud-vapor" },
  { file: "cookin'cloud.webp", slug: "cookin-cloud", darkBg: true },
  { file: "liquideo.webp", slug: "liquideo" },
  { file: "logo-liquidarom-small.jpg", slug: "liquidarom" },
  { file: "logo-liquidelab.webp", slug: "liquide-lab" },
  { file: "swok.webp", slug: "swoke" },
  { file: "logo-all vap's.avif", slug: "all-vaps" },
];

async function toTransparentIfDarkBg(input: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    if (r < 28 && g < 28 && b < 28) data[i + 3] = 0;
  }
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .webp({ quality: 92 })
    .toBuffer();
}

async function toTransparentIfWhiteBg(input: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    if (r > 245 && g > 245 && b > 245) data[i + 3] = 0;
  }
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .webp({ quality: 92 })
    .toBuffer();
}

async function renderBanner(logoPath: string, outPath: string): Promise<void> {
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

async function main() {
  if (!fs.existsSync(SRC)) {
    throw new Error(`Dossier introuvable: ${SRC}`);
  }

  const results: Array<Record<string, unknown>> = [];

  for (const item of MAP) {
    const srcPath = path.join(SRC, item.file);
    if (!fs.existsSync(srcPath)) {
      results.push({
        slug: item.slug,
        ok: false,
        error: `missing source ${item.file}`,
      });
      continue;
    }

    const dir = path.join(MEDIA, item.slug);
    fs.mkdirSync(dir, { recursive: true });
    const outLogo = path.join(dir, "logo.webp");
    const outOnDark = path.join(dir, "logo-on-dark.webp");
    const outBanner = path.join(dir, "banner.webp");

    if (fs.existsSync(outLogo)) {
      const bak = path.join(dir, `logo.webp.bak-${Date.now()}`);
      fs.copyFileSync(outLogo, bak);
    }

    let buf = await sharp(srcPath).ensureAlpha().toBuffer();
    if (item.darkBg) {
      buf = await toTransparentIfDarkBg(buf);
      await sharp(buf).webp({ quality: 92 }).toFile(outOnDark);
    } else {
      buf = await toTransparentIfWhiteBg(buf);
    }
    await sharp(buf).webp({ quality: 92 }).toFile(outLogo);

    const bannerLogo = fs.existsSync(outOnDark) ? outOnDark : outLogo;
    await renderBanner(bannerLogo, outBanner);

    const missing = path.join(dir, "ASSET_MANQUANT.json");
    if (fs.existsSync(missing)) fs.unlinkSync(missing);

    const meta = await sharp(outLogo).metadata();
    results.push({
      slug: item.slug,
      ok: true,
      from: item.file,
      logoBytes: fs.statSync(outLogo).size,
      bannerBytes: fs.statSync(outBanner).size,
      size: `${meta.width}x${meta.height}`,
      onDark: fs.existsSync(outOnDark),
    });
    console.log(`OK ${item.slug} ← ${item.file} (${meta.width}x${meta.height})`);
  }

  const report = path.join(ROOT, "rapports", "import-manufacturer-logos-latest.json");
  fs.mkdirSync(path.dirname(report), { recursive: true });
  fs.writeFileSync(
    report,
    JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2),
    "utf8"
  );
  console.log("report", report);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
