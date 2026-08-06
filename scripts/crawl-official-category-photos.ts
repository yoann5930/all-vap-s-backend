/**
 * Crawl pages catégories / seeds officiels pour packshots manquants.
 * Usage: npx tsx scripts/crawl-official-category-photos.ts --apply
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import "./load-env";
import prisma from "../lib/prisma";
import {
  evaluateEliquidePublishGate,
  isEliquideProduct,
  parseNameProvenance,
} from "../lib/catalog/official-sumup-policy";
import { normalizeCatalogKey } from "../lib/catalog/assert-no-duplicates";

const APPLY = process.argv.includes("--apply");
const UA = "AllVapsCatalogBot/1.0 (+category-crawl)";

const SEEDS: Array<{ mfr: string; urls: string[] }> = [
  {
    mfr: "liquidarom",
    urls: [
      "https://www.liquidarom.com/360-e-liquide-les-collegues",
      "https://www.liquidarom.com/263-les-essentiels",
      "https://www.liquidarom.com/17-les-collegues",
      "https://www.liquidarom.com/18-les-essentiels",
      "https://www.liquidarom.com/261-e-liquides",
    ],
  },
  {
    mfr: "vape-47",
    urls: [
      "https://order.vape47.com/eliquid-enfer/",
      "https://order.vape47.com/96-furiosa",
      "https://order.vape47.com/recherche?controller=search&s=grok",
      "https://order.vape47.com/recherche?controller=search&s=skinz",
    ],
  },
  {
    mfr: "raneki-liquide",
    urls: [
      "https://www.ranekiliquide.fr/recherche?controller=search&s=akashi",
      "https://www.ranekiliquide.fr/recherche?controller=search&s=hanzo",
      "https://www.ranekiliquide.fr/recherche?controller=search&s=musashi",
      "https://www.ranekiliquide.fr/recherche?controller=search&s=ryujin",
      "https://www.ranekiliquide.fr/recherche?controller=search&s=athena",
      "https://www.ranekiliquide.fr/recherche?controller=search&s=poseidon",
      "https://www.ranekiliquide.fr/recherche?controller=search&s=olympe",
      "https://www.ranekiliquide.fr/recherche?controller=search&s=kyoto",
    ],
  },
  {
    mfr: "e-tasty",
    urls: [
      "https://www.e-tasty.fr/recherche?controller=search&s=Numbers",
      "https://www.e-tasty.fr/recherche?controller=search&s=One+Taste",
      "https://www.e-tasty.fr/recherche?controller=search&s=Gang+Organise",
    ],
  },
];

function norm(s: string) {
  return normalizeCatalogKey(s);
}

function extractPackshots(html: string, base: string) {
  const cleaned = html.replace(/\\\//g, "/");
  const out: Array<{ url: string; label: string }> = [];
  for (const m of cleaned.matchAll(
    /(?:https?:\/\/[^"'\s]+)?\/(\d+)-(?:home_default_2x|large_default|home_default)\/([a-z0-9-]+)\.(jpe?g|png|webp)/gi,
  )) {
    if (/fr-default|logo/i.test(m[0])) continue;
    const url = m[0].startsWith("http")
      ? m[0].replace(/\/\d+-home_default\//, (x) => x.replace("home_default", "home_default_2x"))
      : `${base}/${m[1]}-home_default_2x/${m[2]}.${m[3]}`;
    out.push({ url, label: m[2] });
  }
  return out;
}

function score(label: string, productName: string): number {
  const fn = norm(label.replace(/[-_]+/g, " "));
  const pn = norm(productName);
  const stop = new Set([
    "ml", "mg", "eliquide", "liquide", "liquidarom", "les", "collegues", "essentiels",
    "raneki", "vape", "tasty", "furiosa", "skinz", "enfer", "kyoto", "storm", "olympe",
    "e", "la", "le", "de", "du", "des", "et", "by", "the",
  ]);
  const tokens = pn.split(/\s+/).filter((t) => t.length > 2 && !stop.has(t) && !/^\d+$/.test(t));

  // Match personnage / saveur distinctif
  const distinctive = [
    "coquette", "mimi", "baleze", "charmeur", "chocostar", "flambeur", "funkie", "tchatcheur",
    "akashi", "hanzo", "musashi", "ryujin", "maneki", "zenko", "athena", "poseidon", "aphrodite", "hades",
    "grok", "kaiser", "numbers1", "numbers2", "numbers3", "numbers4", "numbers5", "numbers6",
    "numbers7", "numbers8", "numbers9", "numbers10", "numbers11",
    "ptit", "blond", "pastis",
  ];
  for (const d of distinctive) {
    if (pn.includes(d) && fn.includes(d)) return 12;
  }

  // Numbers N exact
  const num = pn.match(/numbers\s*(\d+)/);
  if (num) {
    const n = num[1];
    if (new RegExp(`numbers\\s*0*${n}(?:\\D|$)`).test(fn) || fn.includes(`numbers${n}`)) {
      // reject numbers10 for numbers1
      if (n === "1" && /numbers\s*1\d/.test(fn)) return 0;
      return 12;
    }
    return 0;
  }

  if (!tokens.length) return 0;
  let hits = 0;
  for (const t of tokens) if (fn.includes(t)) hits += 1;
  const ratio = hits / tokens.length;
  if (ratio < 0.6) return 0;
  return ratio * 10;
}

async function download(url: string, dest: string) {
  const candidates = [
    url,
    url.replace("home_default_2x", "home_default"),
    url.replace("home_default_2x", "large_default"),
    url.replace("https://e-tasty.fr/", "https://www.e-tasty.fr/"),
  ];
  for (const u of [...new Set(candidates)]) {
    try {
      const res = await fetch(u, {
        headers: {
          "User-Agent": UA,
          Accept: "image/*",
          Referer: new URL(u).origin + "/",
        },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1200) continue;
      // Reject tiny placeholders
      if (buf.length < 5000 && /default|logo/i.test(u)) continue;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      await sharp(buf)
        .rotate()
        .resize(1000, 1000, {
          fit: "inside",
          background: { r: 11, g: 16, b: 22 },
        })
        .flatten({ background: { r: 11, g: 16, b: 22 } })
        .webp({ quality: 90 })
        .toFile(dest);
      if (fs.existsSync(dest) && fs.statSync(dest).size > 800) return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

async function main() {
  // Collect packshot index per manufacturer
  const index = new Map<string, Array<{ url: string; label: string }>>();
  for (const seed of SEEDS) {
    const list = index.get(seed.mfr) || [];
    for (const url of seed.urls) {
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": UA },
          signal: AbortSignal.timeout(25000),
        });
        if (!res.ok) continue;
        const html = await res.text();
        const base = new URL(url).origin;
        list.push(...extractPackshots(html, base));
        console.log(seed.mfr, url, "→", extractPackshots(html, base).length, "imgs");
      } catch (e) {
        console.log("fail", url, e);
      }
    }
    // dedupe
    const seen = new Set<string>();
    index.set(
      seed.mfr,
      list.filter((x) => {
        if (seen.has(x.url)) return false;
        seen.add(x.url);
        return true;
      }),
    );
  }

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      sumupProductId: { not: null },
      visibleOnline: false,
    },
    include: {
      manufacturer: true,
      rangeRef: true,
    },
  });

  let attached = 0;
  let published = 0;
  const details: Array<Record<string, unknown>> = [];

  let scanned = 0;
  let photoNeeded = 0;
  for (const p of products) {
    if (!isEliquideProduct(p)) continue;
    scanned += 1;
    const gate0 = evaluateEliquidePublishGate({
      category: p.category,
      productType: p.productType,
      volumeMl: p.volumeMl,
      name: p.name,
      sumupName: p.sumupName,
      sumupProductId: p.sumupProductId,
      imageStatus: p.imageStatus,
      imageUrl: p.imageUrl,
      priceCents: p.priceCents,
      sumupMapping: p.sumupMapping,
      nameProvenance: parseNameProvenance(p.sumupMapping),
    });
    if (gate0.canPublishOnline) continue;
    if (!gate0.reasons.includes("photo_officielle_manquante")) continue;
    photoNeeded += 1;

    let mfr = p.manufacturer?.slug || "";
    if (/raneki/i.test(p.name) && mfr === "e-tasty") mfr = "raneki-liquide";
    const pool = index.get(mfr) || [];
    if (/coquette|akashi|numbers1/i.test(p.name)) {
      console.log("debug", {
        name: p.name,
        mfr,
        pool: pool.length,
        reasons: gate0.reasons,
        sampleLabels: pool.slice(0, 5).map((x) => x.label),
      });
    }

    let best: { url: string; label: string; score: number } | null = null;
    for (const img of pool) {
      // Refuse mauvais format (ex. Numbers 100ml pour concentré 30ml)
      const productFmt =
        p.volumeMl === 30 || /30\s*ml/i.test(p.name)
          ? "30ml"
          : p.volumeMl === 10 || /10\s*ml/i.test(p.name)
            ? "10ml"
            : p.volumeMl === 100 || /100\s*ml/i.test(p.name)
              ? "100ml"
              : "50ml";
      const labelFmt = img.label.match(/(\d+)\s*ml/i)?.[1];
      if (labelFmt && `${labelFmt}ml` !== productFmt) continue;

      const s = score(img.label, p.name);
      if (s <= 0) continue;
      if (!best || s > best.score) best = { ...img, score: s };
    }
    if (!best || best.score < 7) continue;

    const destRel = `media/products/${mfr}/${p.rangeRef?.slug || "_unassigned"}/${p.slug}.webp`;
    const destAbs = path.join(process.cwd(), "public", destRel);
    const publicUrl = `/${destRel}`;

    if (APPLY) {
      const ok = await download(best.url, destAbs);
      if (!ok) {
        details.push({ slug: p.slug, error: "download_failed", url: best.url });
        continue;
      }
      await prisma.product.update({
        where: { id: p.id },
        data: { imageUrl: publicUrl, imageStatus: "official", images: [publicUrl] },
      });
      attached += 1;
      const gate = evaluateEliquidePublishGate({
        category: p.category,
        productType: p.productType,
        volumeMl: p.volumeMl,
        name: p.name,
        sumupName: p.sumupName,
        sumupProductId: p.sumupProductId,
        imageStatus: "official",
        imageUrl: publicUrl,
        priceCents: p.priceCents,
        sumupMapping: p.sumupMapping,
        nameProvenance: parseNameProvenance(p.sumupMapping),
      });
      if (gate.canPublishOnline) {
        await prisma.product.update({
          where: { id: p.id },
          data: { visibleOnline: true, catalogStatus: "valide", importAnomaly: null },
        });
        published += 1;
      }
    }

    details.push({
      slug: p.slug,
      mfr,
      matched: best.label,
      score: best.score,
      url: best.url,
    });
  }

  console.log(
    JSON.stringify(
      { apply: APPLY, scanned, photoNeeded, attached, published, details },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
