/**
 * Logo fabricant Liquide Lab — utilise le bandeau marque du site (pas l’icône téléphone).
 * Fallback : mosaïque légère des 4 gammes demandées.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const OUT_DIR = path.resolve("public/media/manufacturers/liquide-lab");
const OUT = path.join(OUT_DIR, "logo.webp");

async function download(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Essais directs (CDN Shopify parfois encore servi)
  const direct = [
    "https://liquidelab.com/cdn/shop/files/logo.png",
    "https://liquidelab.com/cdn/shop/files/logo_liquidelab.png",
    "https://liquidelab.com/img/logo.png",
    "https://liquidelab.com/img/logo.svg",
    "https://liquidelab.com/img/logo.webp",
  ];
  for (const url of direct) {
    const buf = await download(url);
    if (!buf || buf.length < 2000) continue;
    await sharp(buf)
      .resize(640, 640, { fit: "inside", background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .webp({ quality: 92 })
      .toFile(OUT);
    console.log("logo_from", url, fs.statSync(OUT).size);
    return;
  }

  // Mosaïque des 4 gammes intégrées (visuel fabricant réel du site)
  const tiles = [
    "https://liquidelab.com/img/gamme/Glagla.jpg",
    "https://liquidelab.com/img/gamme/Iceberg.jpg",
    "https://liquidelab.com/img/gamme/kuix.jpg",
    "https://liquidelab.com/img/gamme/peche-gourmands.jpg",
  ];
  const buffers: Buffer[] = [];
  for (const url of tiles) {
    const b = await download(url);
    if (b) buffers.push(b);
  }
  if (buffers.length < 4) {
    console.error("tiles_missing", buffers.length);
    process.exit(1);
  }

  const size = 320;
  const resized = await Promise.all(
    buffers.map((b) =>
      sharp(b)
        .resize(size, size, { fit: "cover" })
        .jpeg({ quality: 88 })
        .toBuffer()
    )
  );

  await sharp({
    create: {
      width: size * 2,
      height: size * 2,
      channels: 3,
      background: { r: 12, g: 16, b: 22 },
    },
  })
    .composite([
      { input: resized[0], left: 0, top: 0 },
      { input: resized[1], left: size, top: 0 },
      { input: resized[2], left: 0, top: size },
      { input: resized[3], left: size, top: size },
    ])
    .webp({ quality: 90 })
    .toFile(OUT);

  console.log("logo_mosaic", OUT, fs.statSync(OUT).size);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
