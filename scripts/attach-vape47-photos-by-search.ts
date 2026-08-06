/**
 * Attache photos officielles Vape 47 via recherche B2B produit par produit.
 * Usage: npx tsx scripts/attach-vape47-photos-by-search.ts
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import prisma from "../lib/prisma";
import { evaluateEliquidePublishGate } from "../lib/catalog/official-sumup-policy";

const UA = "AllVapsCatalogBot/1.0 (+Vape47 packshots)";
const OUT_ROOT = path.join(process.cwd(), "public", "media", "products", "vape-47");

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function searchQuery(name: string): string {
  return name
    .replace(/50\s*ml.*$/i, "")
    .replace(/10\s*ml.*$/i, "")
    .replace(/\/.*/g, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

async function findShot(query: string): Promise<string | null> {
  const url = `https://order.vape47.com/recherche?controller=search&s=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) return null;
  const html = await res.text();
  const shots = [
    ...html.matchAll(
      /https?:\/\/order\.vape47\.com\/(\d+)-(?:home_default_2x|home_default|large_default)\/([a-z0-9-]+)\.(jpe?g|png|webp)/gi
    ),
  ];
  if (!shots.length) return null;

  const qn = norm(query);
  let best: { url: string; score: number } | null = null;
  for (const m of shots) {
    const slug = m[2];
    const sn = norm(slug);
    let score = 0;
    for (const t of qn.split(" ")) {
      if (t.length < 3) continue;
      if (sn.includes(t)) score += 2;
    }
    // Prefer v2 for eggz v2 products
    if (/v2/i.test(query) && /v2/i.test(slug)) score += 3;
    if (/eggz/i.test(query) && /eggz/i.test(slug)) score += 2;
    if (/enfer/i.test(query) && /enfer/i.test(slug)) score += 2;
    const abs = `https://order.vape47.com/${m[1]}-home_default_2x/${slug}.${m[3]}`;
    if (!best || score > best.score) best = { url: abs, score };
  }
  return best && best.score >= 4 ? best.url : best?.url ?? null;
}

async function saveWebp(url: string, dest: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "image/*" },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 800) return false;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    await sharp(buf).rotate().resize(900, 900, { fit: "inside" }).webp({ quality: 90 }).toFile(dest);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const mfr = await prisma.manufacturer.findFirst({ where: { slug: "vape-47" } });
  if (!mfr) throw new Error("missing vape-47");

  const products = await prisma.product.findMany({
    where: {
      manufacturerId: mfr.id,
      isActive: true,
      visibleOnline: false,
      OR: [
        { rangeRef: { slug: { in: ["enfer", "les-fruits-d-enfer", "furiosa-eggz"] } } },
        { name: { contains: "Enfer", mode: "insensitive" } },
        { name: { contains: "Furiosa Eggz", mode: "insensitive" } },
      ],
    },
  });

  let published = 0;
  for (const p of products) {
    // Skip if already has official image
    if (p.imageStatus === "official" && p.imageUrl?.startsWith("/media/")) {
      const gate = evaluateEliquidePublishGate({
        name: p.name,
        category: p.category,
        productType: p.productType,
        volumeMl: p.volumeMl,
        sumupProductId: p.sumupProductId,
        sumupName: p.sumupName || p.name,
        priceCents: p.priceCents,
        imageUrl: p.imageUrl,
        imageStatus: p.imageStatus,
      });
      if (gate.canPublishOnline) {
        await prisma.product.update({
          where: { id: p.id },
          data: { visibleOnline: true, catalogStatus: "valide", importAnomaly: null },
        });
        published++;
      }
      continue;
    }

    const q = searchQuery(p.name);
    const shot = await findShot(q);
    if (!shot) {
      console.log("NO SHOT", p.name, "q=", q);
      continue;
    }
    const file = path.join(OUT_ROOT, `${p.slug}.webp`);
    const ok = await saveWebp(shot, file);
    if (!ok) {
      console.log("DL FAIL", p.name, shot);
      continue;
    }
    const publicUrl = `/media/products/vape-47/${p.slug}.webp`;
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
    if (gate.canPublishOnline) {
      published++;
      console.log("PUBLISH", p.name, "←", shot);
    } else {
      console.log("OFFLINE", p.name, gate.reasons.join(","), shot);
    }
  }
  console.log({ offlineBefore: products.length, published });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
