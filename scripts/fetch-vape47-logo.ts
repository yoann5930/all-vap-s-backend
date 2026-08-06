import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const OUT_DIR = path.resolve("public/media/manufacturers/vape-47");
const OUT = path.join(OUT_DIR, "logo.webp");

async function download(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "image/*,*/*" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 800) return null;
    return buf;
  } catch {
    return null;
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const home = await fetch("https://www.vape47.com/", {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const html = await home.text();
  const imgs = [...html.matchAll(/src=["']([^"']+\.(?:png|jpg|jpeg|webp|svg)[^"']*)["']/gi)].map(
    (m) => m[1]
  );
  const logoish = [...new Set(imgs)].filter((u) => /logo|brand|header|vape47/i.test(u));
  console.log("logo candidates", logoish.slice(0, 15));

  const urls = [
    ...logoish.map((u) => (u.startsWith("http") ? u : new URL(u, "https://www.vape47.com/").toString())),
    "https://www.vape47.com/img/logo.jpg",
    "https://www.vape47.com/img/logo.png",
    "https://www.vape47.com/themes/vape47/assets/img/logo.png",
    "https://order.vape47.com/img/logo.jpg",
  ];

  for (const url of urls) {
    const buf = await download(url);
    if (!buf) {
      console.log("fail", url);
      continue;
    }
    try {
      await sharp(buf)
        .resize(640, 640, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 92 })
        .toFile(OUT);
      console.log("OK", url, fs.statSync(OUT).size);
      return;
    } catch (e) {
      console.log("sharp_fail", url, String(e).slice(0, 80));
    }
  }

  // Fallback mosaïque gammes (pages marque si images disponibles)
  console.error("NO_LOGO_FOUND");
  process.exit(1);
}

main();
