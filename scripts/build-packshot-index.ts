/**
 * Génère data/catalog/packshot-index.json depuis public/media/products.
 * Découvre automatiquement tous les dossiers fabricant/gamme.
 *
 *   npx tsx scripts/build-packshot-index.ts
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MEDIA = path.join(ROOT, "public", "media", "products");
const OUT = path.join(ROOT, "data", "catalog", "packshot-index.json");

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function walkWebps(absDir: string) {
  const out: Array<{ flavor: string; url: string }> = [];
  if (!fs.existsSync(absDir)) return out;
  const walk = (dir: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (/^_/.test(ent.name) || /_backup/i.test(ent.name)) continue;
        walk(full);
        continue;
      }
      if (!/\.webp$/i.test(ent.name) || /-thumb\.webp$/i.test(ent.name)) continue;
      const base = ent.name.replace(/\.webp$/i, "");
      if (/^[a-f0-9]{8}$/i.test(base.slice(-8)) && base.includes("-50ml-")) continue;
      if (base.startsWith("les-collegues-") || base.startsWith("les-essentiels-")) continue;
      const flavor = norm(base);
      const url =
        "/" + path.relative(path.join(ROOT, "public"), full).split(path.sep).join("/");
      out.push({ flavor, url });
    }
  };
  walk(absDir);
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

function discoverRanges(): string[] {
  if (!fs.existsSync(MEDIA)) return [];
  const keys: string[] = [];
  for (const mfr of fs.readdirSync(MEDIA, { withFileTypes: true })) {
    if (!mfr.isDirectory() || mfr.name.startsWith("_")) continue;
    const mfrDir = path.join(MEDIA, mfr.name);
    for (const range of fs.readdirSync(mfrDir, { withFileTypes: true })) {
      if (!range.isDirectory() || range.name.startsWith("_")) continue;
      keys.push(`${mfr.name}/${range.name}`);
    }
  }
  return keys.sort();
}

const index: Record<string, Array<{ flavor: string; url: string }>> = {};
let total = 0;
for (const key of discoverRanges()) {
  const files = walkWebps(path.join(MEDIA, ...key.split("/")));
  if (!files.length) continue;
  index[key] = files;
  total += files.length;
  console.log(`${key}: ${files.length}`);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({ generatedAt: new Date().toISOString(), total, ranges: index }, null, 2),
  "utf8"
);
console.log(`Wrote ${OUT} total=${total} ranges=${Object.keys(index).length}`);
