/**
 * Re-télécharge packshots Vape 47 avec match STRICT saveur dans l’URL source.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import prisma from "../lib/prisma";
import { evaluateEliquidePublishGate } from "../lib/catalog/official-sumup-policy";

const UA = "AllVapsCatalogBot/1.0 (+Vape47 strict packshots)";
const OUT = path.join(process.cwd(), "public", "media", "products", "vape-47");

const FLAVOR_ALIASES: Record<string, string[]> = {
  original: ["original"],
  mango: ["mango", "mangue"],
  green: ["green"],
  red: ["red"],
  pink: ["pink"],
  yellow: ["yellow"],
  purple: ["purple"],
  blue: ["blue"],
  ultimate: ["ultimate", "freeze"],
  dragon: ["dragon"],
  cerise: ["cerise"],
  framboise: ["framboise"],
  peche: ["peche", "peche"],
  cassis: ["cassis"],
  aria: ["aria"],
  doom: ["doom"],
  ivy: ["ivy"],
  juno: ["juno"],
  nova: ["nova"],
  volta: ["volta"],
  griffon: ["griffon"],
  ultron: ["ultron"],
  ruby: ["ruby"],
};

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function detectFlavor(name: string): string | null {
  const n = norm(name);
  // Prefer longer keys first
  const keys = Object.keys(FLAVOR_ALIASES).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (n.includes(k)) return k;
    for (const a of FLAVOR_ALIASES[k]) if (n.includes(a)) return k;
  }
  return null;
}

async function searchStrict(productName: string, flavor: string): Promise<string | null> {
  const queries = [
    productName.replace(/\/.*/, "").replace(/-/g, " ").slice(0, 50),
    `${flavor} enfer 50ml`,
    `${flavor} furiosa eggz`,
    `furiosa eggz ${flavor}`,
    `la ${flavor} d enfer`,
    `le ${flavor} d enfer`,
  ];

  for (const q of queries) {
    const url = `https://order.vape47.com/recherche?controller=search&s=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) continue;
    const html = await res.text();
    const shots = [
      ...html.matchAll(
        /https?:\/\/order\.vape47\.com\/(\d+)-(?:home_default_2x|home_default|large_default)\/([a-z0-9-]+)\.(jpe?g|png|webp)/gi
      ),
    ];
    const aliases = FLAVOR_ALIASES[flavor] || [flavor];
    for (const m of shots) {
      const slug = m[2].toLowerCase();
      const hasFlavor = aliases.some((a) => slug.includes(a));
      if (!hasFlavor) continue;
      // Avoid wrong family when possible
      const wantsEggz = /eggz|furiosa/i.test(productName);
      const wantsEnfer = /enfer/i.test(productName) && !/eggz/i.test(productName);
      if (wantsEggz && !/eggz|furiosa/i.test(slug)) continue;
      if (wantsEnfer && !/enfer/i.test(slug)) continue;
      return `https://order.vape47.com/${m[1]}-home_default_2x/${m[2]}.${m[3]}`;
    }
  }
  return null;
}

async function main() {
  const mfr = await prisma.manufacturer.findFirst({ where: { slug: "vape-47" } });
  if (!mfr) throw new Error("missing");

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

  let ok = 0;
  let fail = 0;

  for (const p of products) {
    const flavor = detectFlavor(p.name);
    if (!flavor) {
      console.log("NO FLAVOR", p.name);
      fail++;
      continue;
    }
    const shot = await searchStrict(p.name, flavor);
    if (!shot) {
      console.log("NO STRICT SHOT", p.name, flavor);
      // unpublish if previously wrong
      await prisma.product.update({
        where: { id: p.id },
        data: {
          visibleOnline: false,
          catalogStatus: "a_verifier",
          imageStatus: "pending",
          imageUrl: null,
          importAnomaly: "photo_officielle_a_confirmer",
        },
      });
      fail++;
      continue;
    }

    // Verify flavor in URL
    const aliases = FLAVOR_ALIASES[flavor];
    if (!aliases.some((a) => shot.toLowerCase().includes(a))) {
      console.log("REJECT URL", p.name, shot);
      fail++;
      continue;
    }

    const dest = path.join(OUT, `${p.slug}.webp`);
    const res = await fetch(shot, {
      headers: { "User-Agent": UA, Accept: "image/*" },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      fail++;
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(OUT, { recursive: true });
    await sharp(buf).rotate().resize(900, 900, { fit: "inside" }).webp({ quality: 90 }).toFile(dest);
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
      ok++;
      console.log("OK", p.name, "←", shot.split("/").pop());
    } else {
      fail++;
      console.log("GATE", p.name, gate.reasons.join(","));
    }
  }

  console.log({ ok, fail });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
