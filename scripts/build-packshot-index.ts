/**
 * Génère data/catalog/packshot-index.json depuis public/media/products.
 * Permet l’inférence packshot sur Vercel (sans fs.existsSync runtime).
 *
 *   npx tsx scripts/build-packshot-index.ts
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MEDIA = path.join(ROOT, "public", "media", "products");
const OUT = path.join(ROOT, "data", "catalog", "packshot-index.json");

const RANGES = [
  "liquidarom/ice-cool",
  "liquidarom/ice-cool-x",
  "liquidarom/les-collegues",
  "liquidarom/les-essentiels",
  "liquidarom/replay",
  "cloud-vapor/hellfest",
  "cloud-vapor/kung-freeze",
  "cloud-vapor/call-of-vape",
];

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function walkWebps(absDir: string, key: string) {
  const out: Array<{ flavor: string; url: string }> = [];
  if (!fs.existsSync(absDir)) return out;
  const walk = (dir: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (/_backup/i.test(ent.name)) continue;
        walk(full);
        continue;
      }
      if (!/\.webp$/i.test(ent.name) || /-thumb\.webp$/i.test(ent.name)) continue;
      // Ignorer doublons mal nommés (préfixe gamme / hash suffix)
      const base = ent.name.replace(/\.webp$/i, "");
      if (/^[a-f0-9]{8}$/i.test(base.slice(-8)) && base.includes("-50ml-")) continue;
      if (base.startsWith("les-collegues-") || base.startsWith("les-essentiels-")) continue;
      const flavor = norm(base);
      const url = "/" + path.relative(path.join(ROOT, "public"), full).split(path.sep).join("/");
      out.push({ flavor, url });
    }
  };
  walk(absDir);
  // Préférer chemins courts /50ml/ /100ml/ et noms saveur purs
  out.sort((a, b) => a.url.length - b.url.length || a.flavor.localeCompare(b.flavor));
  const seen = new Set<string>();
  const dedup: typeof out = [];
  for (const f of out) {
    if (seen.has(f.flavor)) continue;
    seen.add(f.flavor);
    dedup.push(f);
  }
  return dedup;
}

const index: Record<string, Array<{ flavor: string; url: string }>> = {};
let total = 0;
for (const key of RANGES) {
  const files = walkWebps(path.join(MEDIA, ...key.split("/")), key);
  index[key] = files;
  total += files.length;
  console.log(`${key}: ${files.length}`);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({ generatedAt: new Date().toISOString(), total, ranges: index }, null, 2),
  "utf8",
);
console.log(`Wrote ${OUT} total=${total}`);
