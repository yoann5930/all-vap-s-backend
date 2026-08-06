/**
 * Attache packshots officiels Vape 47 (order.vape47.com = B2B fabricant)
 * et republie les produits qui passent le gate.
 *
 * Usage: npx tsx scripts/attach-vape47-official-photos.ts
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import prisma from "../lib/prisma";
import { evaluateEliquidePublishGate } from "../lib/catalog/official-sumup-policy";

const UA = "AllVapsCatalogBot/1.0 (+Vape47 official packshots)";
const OUT_ROOT = path.join(process.cwd(), "public", "media", "products", "vape-47");

const CATEGORY_PAGES = [
  "https://order.vape47.com/8902-eliquid-enfer",
  "https://order.vape47.com/8903-les-fruits-d-enfer",
  "https://order.vape47.com/8910-furiosa-eggz",
  "https://order.vape47.com/189-furiosa-eggz",
];

type Shot = { url: string; slug: string; label: string };

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function extractShots(html: string, base: string): Shot[] {
  const shots: Shot[] = [];
  const re =
    /https?:\/\/order\.vape47\.com\/(\d+)-(?:home_default_2x|large_default|home_default)\/([a-z0-9-]+)\.(jpe?g|png|webp)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const id = m[1];
    const slug = m[2];
    const ext = m[3];
    const url = `https://order.vape47.com/${id}-home_default_2x/${slug}.${ext}`;
    shots.push({ url, slug, label: slug.replace(/-/g, " ") });
  }
  // relative
  const re2 =
    /\/(\d+)-(?:home_default_2x|home_default)\/([a-z0-9-]+)\.(jpe?g|png|webp)/gi;
  while ((m = re2.exec(html))) {
    const id = m[1];
    const slug = m[2];
    const ext = m[3];
    const url = new URL(`/${id}-home_default_2x/${slug}.${ext}`, base).toString();
    shots.push({ url, slug, label: slug.replace(/-/g, " ") });
  }
  const seen = new Set<string>();
  return shots.filter((s) => {
    if (seen.has(s.slug)) return false;
    seen.add(s.slug);
    return true;
  });
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchScore(productName: string, shot: Shot): number {
  const pn = norm(productName);
  const sn = norm(shot.slug);
  const tokens = sn.split(" ").filter((t) => t.length > 2 && !["0mg", "50ml", "10ml", "ml"].includes(t));
  let score = 0;
  for (const t of tokens) {
    if (pn.includes(t)) score += t.length > 5 ? 3 : 2;
  }
  // flavor keywords
  for (const flavor of [
    "original",
    "mango",
    "green",
    "red",
    "pink",
    "yellow",
    "purple",
    "blue",
    "ultimate",
    "freeze",
    "dragon",
    "cerise",
    "framboise",
    "peche",
    "cassis",
    "aria",
    "doom",
    "ivy",
    "juno",
    "nova",
    "volta",
    "griffon",
    "ultron",
    "ruby",
    "ryu",
    "falkor",
    "soko",
  ]) {
    if (pn.includes(flavor) && sn.includes(flavor)) score += 5;
  }
  return score;
}

async function downloadToWebp(url: string, dest: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "image/*" },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000) return false;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    await sharp(buf).rotate().resize(900, 900, { fit: "inside" }).webp({ quality: 90 }).toFile(dest);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const allShots: Shot[] = [];
  for (const page of CATEGORY_PAGES) {
    const html = await fetchHtml(page);
    if (!html) {
      console.log("skip page", page);
      continue;
    }
    const shots = extractShots(html, page);
    console.log(page, "→", shots.length, "shots");
    allShots.push(...shots);
  }

  // Dedupe by slug
  const bySlug = new Map<string, Shot>();
  for (const s of allShots) bySlug.set(s.slug, s);
  const shots = [...bySlug.values()];
  console.log("unique shots", shots.length);

  const mfr = await prisma.manufacturer.findFirst({ where: { slug: "vape-47" } });
  if (!mfr) throw new Error("vape-47 missing");

  const products = await prisma.product.findMany({
    where: {
      manufacturerId: mfr.id,
      isActive: true,
      OR: [
        { rangeRef: { slug: { in: ["enfer", "les-fruits-d-enfer", "furiosa-eggz"] } } },
        { name: { contains: "Enfer", mode: "insensitive" } },
        { name: { contains: "Furiosa Eggz", mode: "insensitive" } },
      ],
    },
  });

  let attached = 0;
  let published = 0;

  for (const p of products) {
    let best: Shot | null = null;
    let bestScore = 0;
    for (const s of shots) {
      const sc = matchScore(p.name, s);
      if (sc > bestScore) {
        bestScore = sc;
        best = s;
      }
    }
    if (!best || bestScore < 5) {
      console.log("NO MATCH", p.name, "best", best?.slug, bestScore);
      continue;
    }

    const file = path.join(OUT_ROOT, `${p.slug || best.slug}.webp`);
    const ok = await downloadToWebp(best.url, file);
    if (!ok) {
      console.log("DL FAIL", p.name, best.url);
      continue;
    }
    const publicUrl = `/media/products/vape-47/${path.basename(file)}`;

    const gate = evaluateEliquidePublishGate({
      name: p.name,
      category: p.category,
      productType: p.productType,
      volumeMl: p.volumeMl,
      sumupProductId: p.sumupProductId,
      sumupName: p.sumupName || p.name,
      priceCents: p.priceCents,
      imageUrl: publicUrl,
      imageStatus: "official",
      sumupMapping: p.sumupMapping,
    });

    await prisma.product.update({
      where: { id: p.id },
      data: {
        imageUrl: publicUrl,
        imageStatus: "official",
        sumupName: p.sumupName || p.name,
        visibleOnline: gate.canPublishOnline,
        catalogStatus: gate.canPublishOnline ? "valide" : "a_verifier",
        importAnomaly: gate.canPublishOnline ? null : gate.reasons.join("|"),
      },
    });
    attached++;
    if (gate.canPublishOnline) {
      published++;
      console.log("PUBLISH", p.name, "←", best.slug);
    } else {
      console.log("ATTACHED (offline)", p.name, gate.reasons.join(","));
    }
  }

  // Cover ENFER from packshot mosaic (lisibilité)
  const enferShots = shots.filter((s) => /enfer/i.test(s.slug) && !/fruit/i.test(s.slug)).slice(0, 4);
  if (enferShots.length >= 2) {
    const tiles: Buffer[] = [];
    for (const s of enferShots.slice(0, 4)) {
      const res = await fetch(s.url, { headers: { "User-Agent": UA } });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      tiles.push(
        await sharp(buf).resize(600, 600, { fit: "cover" }).jpeg({ quality: 88 }).toBuffer()
      );
    }
    if (tiles.length >= 2) {
      const cols = 2;
      const rows = Math.ceil(tiles.length / cols);
      const mosaic = sharp({
        create: {
          width: cols * 600,
          height: rows * 600,
          channels: 3,
          background: "#0B1016",
        },
      });
      const composites = tiles.map((input, i) => ({
        input,
        left: (i % cols) * 600,
        top: Math.floor(i / cols) * 600,
      }));
      const coverPath = path.join(
        process.cwd(),
        "public/media/manufacturers/vape-47/ranges/enfer.webp"
      );
      await mosaic
        .composite(composites)
        .resize(1400, 875, { fit: "cover" })
        .webp({ quality: 90 })
        .toFile(coverPath);
      console.log("ENFER cover mosaic OK", coverPath);
    }
  }

  console.log({ attached, published, products: products.length, shots: shots.length });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
