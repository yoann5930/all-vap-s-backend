/**
 * Corrige le logo Vape 47 (remplace le placeholder PrestaShop "my store")
 * + covers ENFER / Fruits d'ENFER / Furiosa Eggz depuis vape47.com officiel.
 *
 * Usage: npx tsx scripts/fix-vape47-official-assets.ts
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "public", "media", "manufacturers", "vape-47");
const RANGES = path.join(OUT, "ranges");
const PROBE = path.join(ROOT, "tmp", "vape47-probe");
const UA = "AllVapsCatalogBot/1.0 (+official Vape47 assets)";

const OFFICIAL = {
  logoSvg: "https://www.vape47.com/icon.svg",
  enfer: "https://www.vape47.com/images/marques/enfer.webp",
  furiosaEggz: "https://www.vape47.com/images/marques/furiosa-eggz.webp",
} as const;

async function download(url: string, dest: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "image/*,*/*" },
    redirect: "follow",
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return buf;
}

function backupIfExists(file: string, bakName: string) {
  if (!fs.existsSync(file)) return;
  const bak = path.join(path.dirname(file), bakName);
  if (!fs.existsSync(bak)) fs.copyFileSync(file, bak);
}

async function main() {
  fs.mkdirSync(PROBE, { recursive: true });
  fs.mkdirSync(RANGES, { recursive: true });

  console.log("→ Téléchargement assets officiels vape47.com…");
  const svg = await download(OFFICIAL.logoSvg, path.join(PROBE, "icon.svg"));
  const enferBuf = await download(OFFICIAL.enfer, path.join(PROBE, "enfer.webp"));
  const furiosaBuf = await download(
    OFFICIAL.furiosaEggz,
    path.join(PROBE, "furiosa-eggz.webp")
  );

  // Refuse PrestaShop placeholders
  const logoPath = path.join(OUT, "logo.webp");
  backupIfExists(logoPath, "logo.WRONG-prestashop-mystore.webp.bak");
  backupIfExists(path.join(RANGES, "enfer.webp"), "enfer.OLD-low-contrast.webp.bak");
  backupIfExists(
    path.join(RANGES, "les-fruits-d-enfer.webp"),
    "les-fruits-d-enfer.OLD-low-contrast.webp.bak"
  );

  console.log("→ Conversion logo officiel SVG → webp…");
  await sharp(svg)
    .resize(800, 800, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 92 })
    .toFile(logoPath);
  await sharp(svg)
    .resize(800, 800, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 92 })
    .toFile(path.join(OUT, "logo-on-dark.webp"));
  await sharp(svg)
    .resize(800, 800, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .webp({ quality: 92 })
    .toFile(path.join(OUT, "logo-on-light.webp"));

  // Source SVG also kept for reference / cache busting
  fs.writeFileSync(path.join(OUT, "logo.svg"), svg);

  console.log("→ Cover ENFER (boost contraste sur asset officiel)…");
  // ENFER officiel est très sombre : on l’éclaircit + on compose un fond pour lisibilité
  const enferBoosted = await sharp(enferBuf)
    .resize(1400, 875, { fit: "contain", background: "#0B1016" })
    .modulate({ brightness: 3.2, saturation: 1.15 })
    .linear(2.2, -30)
    .toBuffer();

  // Si toujours trop sombre : overlay texte blanc « ENFER » généré
  const stats = await sharp(enferBoosted).stats();
  const mean =
    (stats.channels[0].mean + stats.channels[1].mean + stats.channels[2].mean) / 3;
  console.log("  luminosité moyenne ENFER boostée:", mean.toFixed(1));

  let enferFinal = enferBoosted;
  if (mean < 45) {
    console.log("  → trop sombre, génération cover typographique contrastée");
    const svgCover = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="875" viewBox="0 0 1400 875">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a0508"/>
      <stop offset="50%" stop-color="#0B1016"/>
      <stop offset="100%" stop-color="#1a1020"/>
    </linearGradient>
    <linearGradient id="t" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#c8d0dc"/>
    </linearGradient>
  </defs>
  <rect width="1400" height="875" fill="url(#bg)"/>
  <text x="700" y="470" text-anchor="middle" font-family="Arial Black, Impact, sans-serif"
        font-size="168" font-weight="900" letter-spacing="18" fill="url(#t)">ENFER</text>
  <text x="700" y="560" text-anchor="middle" font-family="Arial, sans-serif"
        font-size="28" letter-spacing="10" fill="#A7B0BC">VAPE 47</text>
</svg>`);
    enferFinal = await sharp(svgCover).webp({ quality: 92 }).toBuffer();
  } else {
    enferFinal = await sharp(enferBoosted).webp({ quality: 90 }).toBuffer();
  }

  fs.writeFileSync(path.join(RANGES, "enfer.webp"), enferFinal);
  // Les Fruits d'ENFER : même identité visuelle + sous-titre
  const fruitsSvg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="875" viewBox="0 0 1400 875">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a0508"/>
      <stop offset="55%" stop-color="#0B1016"/>
      <stop offset="100%" stop-color="#201018"/>
    </linearGradient>
  </defs>
  <rect width="1400" height="875" fill="url(#bg)"/>
  <text x="700" y="400" text-anchor="middle" font-family="Arial Black, Impact, sans-serif"
        font-size="120" font-weight="900" letter-spacing="14" fill="#ffffff">ENFER</text>
  <text x="700" y="500" text-anchor="middle" font-family="Arial, sans-serif"
        font-size="42" letter-spacing="6" fill="#E8B4B8">LES FRUITS D'ENFER</text>
  <text x="700" y="580" text-anchor="middle" font-family="Arial, sans-serif"
        font-size="24" letter-spacing="8" fill="#A7B0BC">VAPE 47</text>
</svg>`);
  await sharp(fruitsSvg).webp({ quality: 92 }).toFile(path.join(RANGES, "les-fruits-d-enfer.webp"));

  await sharp(furiosaBuf)
    .resize(1400, 875, { fit: "contain", background: "#000000" })
    .webp({ quality: 90 })
    .toFile(path.join(RANGES, "furiosa-eggz.webp"));

  // meta display hints
  const logoMeta = await sharp(logoPath).metadata();
  const display = {
    objectFit: "contain",
    scale: 1.05,
    padding: 20,
    background: "transparent",
    variant: "auto",
    aspect: "square",
    source: OFFICIAL.logoSvg,
    verifiedAt: new Date().toISOString(),
    width: logoMeta.width,
    height: logoMeta.height,
  };
  fs.writeFileSync(
    path.join(OUT, "logo-display.json"),
    JSON.stringify(display, null, 2),
    "utf8"
  );

  console.log("OK logo.webp", fs.statSync(logoPath).size, `${logoMeta.width}x${logoMeta.height}`);
  console.log("OK enfer.webp", fs.statSync(path.join(RANGES, "enfer.webp")).size);
  console.log(
    "OK les-fruits-d-enfer.webp",
    fs.statSync(path.join(RANGES, "les-fruits-d-enfer.webp")).size
  );
  console.log("OK furiosa-eggz.webp", fs.statSync(path.join(RANGES, "furiosa-eggz.webp")).size);
  console.log("Source logo:", OFFICIAL.logoSvg);
  console.log("⚠ Ne plus jamais utiliser order.vape47.com/img/logo.jpg (PrestaShop my store)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
