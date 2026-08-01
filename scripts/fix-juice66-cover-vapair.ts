/**
 * Juice 66 — cover depuis packshots officiels Vapair (fabricant/distributeur Juice 66).
 * Site juice66.fr : DNS mort ; aucune archive logo.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const OUT = path.join(
  process.cwd(),
  "public",
  "media",
  "manufacturers",
  "juice-66"
);
const UA = "AllVapsCatalogBot/1.0 (+official Vapair / Juice 66 assets)";

const PACKSHOTS = [
  "https://www.vapair.pro/1367-large_default/juice-66-ratz-rod-100-ml.jpg",
  "https://www.vapair.pro/2036-large_default/juice-66-monza-purple-50ml.jpg",
  "https://www.vapair.pro/1314-large_default/juice-66-red-apple.jpg",
  "https://www.vapair.pro/1313-large_default/juice-66-red-66.jpg",
];

async function download(url: string) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "image/*" },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 800) throw new Error(`small ${url}`);
  return buf;
}

async function main() {
  fs.mkdirSync(path.join(OUT, "ranges"), { recursive: true });
  const bufs: Buffer[] = [];
  for (const url of PACKSHOTS) {
    try {
      const b = await download(url);
      bufs.push(b);
      console.log("ok", url, b.length);
    } catch (e) {
      console.log("fail", (e as Error).message);
    }
  }
  if (bufs.length < 2) {
    console.error("BLOCKED: pas assez de packshots Juice 66");
    process.exit(2);
  }

  const size = 600;
  const tiles = await Promise.all(
    bufs.slice(0, 4).map((b) =>
      sharp(b)
        .rotate()
        .resize(size, size, { fit: "cover", position: "centre" })
        .jpeg({ quality: 88 })
        .toBuffer()
    )
  );
  while (tiles.length < 4) tiles.push(tiles[tiles.length - 1]);

  const cover = path.join(OUT, "ranges", "66-juice-juice-66.webp");
  await sharp({
    create: {
      width: size * 2,
      height: size * 2,
      channels: 3,
      background: { r: 11, g: 16, b: 22 },
    },
  })
    .composite([
      { input: tiles[0], left: 0, top: 0 },
      { input: tiles[1], left: size, top: 0 },
      { input: tiles[2], left: 0, top: size },
      { input: tiles[3], left: size, top: size },
    ])
    .webp({ quality: 90 })
    .toFile(cover);

  // Logo = premier packshot implanté (identité gamme) si pas de logo marque
  const logo = path.join(OUT, "logo.webp");
  await sharp(bufs[0])
    .ensureAlpha()
    .resize({ width: 960, height: 480, fit: "inside" })
    .webp({ quality: 92 })
    .toFile(logo);

  console.log("COVER", cover, fs.statSync(cover).size);
  console.log("LOGO", logo, fs.statSync(logo).size);
  console.log(
    JSON.stringify({
      key: "juice-66/66-juice-juice-66",
      status: "OK",
      mode: "mosaic_official_distributor_vapair",
      source: "https://www.vapair.pro/90-juice-66-",
      packshots: PACKSHOTS.slice(0, bufs.length),
      note: "juice66.fr DNS mort ; Vapair = fabricant/distributeur officiel Juice 66",
    })
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
