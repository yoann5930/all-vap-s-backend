/**
 * Télécharge les images officielles Liquidarom (bouteille seule) depuis liquidarom.com
 * et les convertit en WebP 1200×1200 via sharp.
 *
 * Usage: npx tsx scripts/fetch-liquidarom-official-images.ts [--limit 5]
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { parseSemicolonCsv } from "../lib/catalog/liquidarom-import";
import {
  productFlavorSlug,
  productPublicImagePath,
  rangeFolderFromText,
  resolveOfficialName,
} from "../lib/catalog/liquidarom-meta";

const OFFICIAL_BASE = "https://www.liquidarom.com";

type FetchResult = {
  reference: string;
  name: string;
  status: "downloaded" | "not_found" | "error";
  sourceUrl?: string;
  localPath?: string;
  error?: string;
};

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ");
}

async function discoverProductLinks(): Promise<Array<{ url: string; title: string }>> {
  const links = new Map<string, { url: string; title: string }>();
  const seeds = [
    `${OFFICIAL_BASE}/`,
    `${OFFICIAL_BASE}/2-accueil`,
    `${OFFICIAL_BASE}/3-ice-cool`,
    `${OFFICIAL_BASE}/16-ice-cool-x`,
    `${OFFICIAL_BASE}/17-les-collegues`,
    `${OFFICIAL_BASE}/18-les-essentiels`,
  ];

  for (const seed of seeds) {
    try {
      const res = await fetch(seed, { headers: { "User-Agent": "AllVapsCatalogBot/1.0" } });
      if (!res.ok) continue;
      const html = await res.text();
      const re = /href="(\/[^"#?]+-\d+\.html)"/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html))) {
        const href = m[1];
        if (!/e-liquide|eliquide|liquide|50ml|50-ml/i.test(href)) continue;
        const url = `${OFFICIAL_BASE}${href}`;
        links.set(url, { url, title: href });
      }
    } catch {
      /* ignore seed failures */
    }
  }
  return [...links.values()];
}

async function extractProductImage(pageUrl: string): Promise<{ imageUrl: string; title: string } | null> {
  const res = await fetch(pageUrl, { headers: { "User-Agent": "AllVapsCatalogBot/1.0" } });
  if (!res.ok) return null;
  const html = await res.text();
  const titleMatch = html.match(/<h1[^>]*>([^<]+)</i) || html.match(/<title>([^<|]+)/i);
  const title = (titleMatch?.[1] || "").trim();
  const imgMatch =
    html.match(/id="bigpic"[^>]+src="([^"]+)"/i) ||
    html.match(/class="[^"]*product-cover[^"]*"[^>]+src="([^"]+)"/i) ||
    html.match(/data-image-large-src="([^"]+)"/i) ||
    html.match(/<img[^>]+src="([^"]+)"[^>]+(?:product|large|cover)/i);
  if (!imgMatch) return null;
  let imageUrl = imgMatch[1];
  if (imageUrl.startsWith("//")) imageUrl = `https:${imageUrl}`;
  else if (imageUrl.startsWith("/")) imageUrl = `${OFFICIAL_BASE}${imageUrl}`;
  return { imageUrl, title };
}

function scoreMatch(productName: string, pageTitle: string): number {
  const a = normalizeForMatch(productName);
  const b = normalizeForMatch(pageTitle);
  const tokens = a.split(" ").filter((t) => t.length > 2);
  if (!tokens.length) return 0;
  const hits = tokens.filter((t) => b.includes(t)).length;
  return hits / tokens.length;
}

async function processImageBuffer(buffer: Buffer, outPath: string, thumbPath: string) {
  const image = sharp(buffer).rotate().trim({ threshold: 10 });
  const meta = await image.metadata();
  const size = Math.max(meta.width || 1200, meta.height || 1200, 1200);
  const padded = await image
    .resize({
      width: Math.round(size * 0.84),
      height: Math.round(size * 0.84),
      fit: "inside",
      withoutEnlargement: false,
    })
    .extend({
      top: Math.round(size * 0.08),
      bottom: Math.round(size * 0.08),
      left: Math.round(size * 0.08),
      right: Math.round(size * 0.08),
      background: { r: 11, g: 16, b: 22, alpha: 1 },
    })
    .resize(1200, 1200, { fit: "contain", background: { r: 11, g: 16, b: 22, alpha: 1 } })
    .webp({ quality: 90 })
    .toBuffer();

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, padded);
  await sharp(padded).resize(500, 500, { fit: "inside" }).webp({ quality: 85 }).toFile(thumbPath);
}

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;
  const csvPath = path.join(process.cwd(), "data/liquidarom/All_Vaps_Produits_Magasin_MAJ_Liquidarom.csv");
  const rows = parseSemicolonCsv(fs.readFileSync(csvPath, "utf8"));
  const targets = limit ? rows.slice(0, limit) : rows;

  console.log("[fetch] Découverte des fiches officielles…");
  const pages = await discoverProductLinks();
  console.log(`[fetch] ${pages.length} liens produits candidats`);

  const results: FetchResult[] = [];

  for (const row of targets) {
    const ref = row["ID produit"];
    const range = row["Sous-catégorie"] || "";
    const name = resolveOfficialName(ref, row["Nom commercial"]);
    const rel = productPublicImagePath({ range, commercialName: name });
    const abs = path.join(process.cwd(), "public", rel.replace(/^\//, "").replace(/\//g, path.sep));
    const thumbRel = productPublicImagePath({ range, commercialName: name, thumb: true });
    const thumbAbs = path.join(process.cwd(), "public", thumbRel.replace(/^\//, "").replace(/\//g, path.sep));

    if (fs.existsSync(abs)) {
      results.push({ reference: ref, name, status: "downloaded", localPath: rel });
      continue;
    }

    let best: { url: string; title: string; score: number; imageUrl?: string } | null = null;
    for (const page of pages) {
      const detail = await extractProductImage(page.url);
      if (!detail) continue;
      const score = scoreMatch(name, detail.title);
      if (!best || score > best.score) {
        best = { url: page.url, title: detail.title, score, imageUrl: detail.imageUrl };
      }
    }

    if (!best || best.score < 0.45 || !best.imageUrl) {
      results.push({ reference: ref, name, status: "not_found", error: "Aucune fiche officielle correspondante" });
      continue;
    }

    try {
      const imgRes = await fetch(best.imageUrl);
      if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);
      const buf = Buffer.from(await imgRes.arrayBuffer());
      await processImageBuffer(buf, abs, thumbAbs);
      results.push({
        reference: ref,
        name,
        status: "downloaded",
        sourceUrl: best.imageUrl,
        localPath: rel,
      });
      console.log(`[ok] ${ref} ${name} ← ${best.url}`);
    } catch (err) {
      results.push({
        reference: ref,
        name,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const reportPath = path.join(process.cwd(), "data/liquidarom/IMAGE_FETCH_REPORT.json");
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), "utf8");
  console.log(JSON.stringify({
    downloaded: results.filter((r) => r.status === "downloaded").length,
    notFound: results.filter((r) => r.status === "not_found").length,
    errors: results.filter((r) => r.status === "error").length,
    reportPath,
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
