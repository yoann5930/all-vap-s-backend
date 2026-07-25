/**
 * Phase 10 — Generate All Vap's official icons, favicons, splash from logo PNG.
 * Usage: node scripts/generate-brand-assets.mjs
 */
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const workspace = path.resolve(root, "..");
const srcLogo = path.join(root, "public", "brand", "logo-official.png");
const dsRoot = path.join(workspace, "design-system");

const BLACK = { r: 5, g: 5, b: 5, alpha: 1 };
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function squareOnBlack(size, { padRatio = 0.18 } = {}) {
  const pad = Math.round(size * padRatio);
  const inner = size - pad * 2;
  const logo = await sharp(srcLogo)
    .resize(inner, inner, { fit: "contain", background: BLACK })
    .png()
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: BLACK },
  })
    .composite([{ input: logo, gravity: "centre" }])
    .png()
    .toBuffer();
}

async function monochromeIcon(size) {
  const buf = await squareOnBlack(size, { padRatio: 0.2 });
  // Flatten to white silhouette on transparent for Android monochrome
  return sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
    .then(async ({ data, info }) => {
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const lum = (r + g + b) / 3;
        // Light pixels → white opaque; dark → transparent
        if (lum > 40) {
          data[i] = 255;
          data[i + 1] = 255;
          data[i + 2] = 255;
          data[i + 3] = 255;
        } else {
          data[i + 3] = 0;
        }
      }
      return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
        .png()
        .toBuffer();
    });
}

async function writeBoth(relPublic, relDs, buffer) {
  const pub = path.join(root, "public", relPublic);
  const ds = path.join(dsRoot, relDs);
  await ensureDir(path.dirname(pub));
  await ensureDir(path.dirname(ds));
  await fs.promises.writeFile(pub, buffer);
  await fs.promises.writeFile(ds, buffer);
}

async function main() {
  if (!fs.existsSync(srcLogo)) {
    console.error("Missing logo:", srcLogo);
    process.exit(1);
  }

  // Android legacy / round / adaptive foreground
  const androidSizes = [48, 72, 96, 144, 192, 512];
  for (const s of androidSizes) {
    const legacy = await squareOnBlack(s);
    await writeBoth(`icons/android/ic_launcher_${s}.png`, `icons/android/legacy_${s}.png`, legacy);

    const round = await sharp(await squareOnBlack(s))
      .composite([
        {
          input: Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}">
              <circle cx="${s / 2}" cy="${s / 2}" r="${s / 2}" fill="white"/>
            </svg>`
          ),
          blend: "dest-in",
        },
      ])
      .png()
      .toBuffer();
    await writeBoth(`icons/android/ic_launcher_round_${s}.png`, `icons/android/round_${s}.png`, round);

    const mono = await monochromeIcon(s);
    await writeBoth(
      `icons/android/ic_launcher_monochrome_${s}.png`,
      `icons/android/monochrome_${s}.png`,
      mono
    );
  }

  // Adaptive: foreground (transparent-ish pad) + background solid
  const adaptiveFg = await sharp(srcLogo)
    .resize(432, 432, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const adaptiveCanvas = await sharp({
    create: { width: 1080, height: 1080, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: adaptiveFg, gravity: "centre" }])
    .png()
    .toBuffer();
  await writeBoth(
    "icons/android/ic_launcher_foreground.png",
    "icons/android/adaptive_foreground.png",
    adaptiveCanvas
  );

  const adaptiveBg = await sharp({
    create: { width: 1080, height: 1080, channels: 4, background: BLACK },
  })
    .png()
    .toBuffer();
  await writeBoth(
    "icons/android/ic_launcher_background.png",
    "icons/android/adaptive_background.png",
    adaptiveBg
  );

  // iOS app icons
  const ios = [
    20, 29, 40, 50, 57, 58, 60, 72, 76, 80, 87, 100, 114, 120, 144, 152, 167, 180, 1024,
  ];
  for (const s of ios) {
    const buf = await squareOnBlack(s, { padRatio: 0.14 });
    await writeBoth(`icons/ios/icon_${s}.png`, `icons/ios/icon_${s}.png`, buf);
  }

  // PWA
  for (const s of [72, 96, 128, 144, 152, 192, 384, 512]) {
    const buf = await squareOnBlack(s);
    await writeBoth(`icons/pwa/icon-${s}.png`, `icons/pwa/icon-${s}.png`, buf);
  }

  // Favicons
  for (const s of [16, 32, 48, 64]) {
    const buf = await squareOnBlack(s, { padRatio: 0.12 });
    await writeBoth(`favicon-${s}.png`, `icons/favicon/favicon-${s}.png`, buf);
  }
  const favicon32 = await squareOnBlack(32, { padRatio: 0.12 });
  await writeBoth("favicon.ico.png", "icons/favicon/favicon-32.png", favicon32);
  // Also write as apple-touch and main icons
  const apple = await squareOnBlack(180, { padRatio: 0.14 });
  await writeBoth("apple-touch-icon.png", "icons/ios/apple-touch-icon.png", apple);
  const icon192 = await squareOnBlack(192);
  const icon512 = await squareOnBlack(512);
  await writeBoth("icon-192.png", "icons/pwa/icon-192.png", icon192);
  await writeBoth("icon-512.png", "icons/pwa/icon-512.png", icon512);

  // OG image 1200x630
  const ogLogo = await sharp(srcLogo)
    .resize(480, 480, { fit: "contain", background: BLACK })
    .png()
    .toBuffer();
  const og = await sharp({
    create: { width: 1200, height: 630, channels: 4, background: BLACK },
  })
    .composite([{ input: ogLogo, gravity: "centre" }])
    .png()
    .toBuffer();
  await writeBoth("brand/og-image.png", "logo/og-image.png", og);

  // Splash screens
  const splashSizes = [
    { name: "splash-1080x1920", w: 1080, h: 1920 },
    { name: "splash-1170x2532", w: 1170, h: 2532 },
    { name: "splash-1284x2778", w: 1284, h: 2778 },
    { name: "splash-2048x2732", w: 2048, h: 2732 },
    { name: "splash-1920x1080", w: 1920, h: 1080 },
  ];
  for (const { name, w, h } of splashSizes) {
    const logoSize = Math.round(Math.min(w, h) * 0.38);
    const logo = await sharp(srcLogo)
      .resize(logoSize, logoSize, { fit: "contain", background: BLACK })
      .png()
      .toBuffer();
    const splash = await sharp({
      create: { width: w, height: h, channels: 4, background: BLACK },
    })
      .composite([{ input: logo, gravity: "centre" }])
      .png()
      .toBuffer();
    await writeBoth(`splash/${name}.png`, `splash/${name}.png`, splash);
  }

  // Design-system copy of official logo already present; ensure SVG wordmark placeholder note
  console.log("✓ Brand assets generated");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
