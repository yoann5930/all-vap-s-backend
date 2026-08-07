/**
 * Corrections SÛRES uniquement — rattachements e-liquides SumUp → gammes déjà
 * présentes en assets/DB (covers officiels). Aucune invention de logo/gamme.
 *
 * Usage: npx tsx scripts/apply-safe-eliquide-range-links.ts
 */
import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "../lib/import/csv";
import {
  loadKnownManufacturers,
  norm,
} from "../lib/catalog/sumup-eliquide-manufacturers";
import prisma from "../lib/prisma";

const ROOT = process.cwd();
const CSV = path.join(
  ROOT,
  "inbox_sumup",
  "2026-08-03_16-46-54_items-export_MCGR4RXU.csv"
);
const MEDIA = path.join(ROOT, "public", "media", "manufacturers");

/** Tokens SumUp → slug couverture / gamme DB (certains uniquement, cover déjà présent). */
const CERTAIN_RANGE_TOKENS: Record<string, Array<{ token: string; rangeSlug: string }>> = {
  "e-tasty": [
    { token: "inspiration", rangeSlug: "inspiration" },
    { token: "bankiz", rangeSlug: "bankiz" },
    { token: "godfallcity", rangeSlug: "god-fall-city" },
    { token: "god fall city", rangeSlug: "god-fall-city" },
    { token: "freezy crush", rangeSlug: "freezy-crush" },
    { token: "gang organise", rangeSlug: "gang-organise" },
    { token: "smoke wars", rangeSlug: "smoke-wars" },
    { token: "one taste", rangeSlug: "one-taste" },
    { token: "twenty", rangeSlug: "twenty" },
    { token: "letters", rangeSlug: "letters" },
    { token: "numbers", rangeSlug: "numbers" },
  ],
  liquidarom: [
    { token: "ice cool x", rangeSlug: "ice-cool-x" },
    { token: "ice cool", rangeSlug: "ice-cool" },
    { token: "les collegues", rangeSlug: "les-collegues" },
    { token: "les collegues", rangeSlug: "les-collegues" },
    { token: "les essentiels", rangeSlug: "les-essentiels" },
  ],
  "biarritz-lab": [
    { token: "fruit defendu", rangeSlug: "le-fruit-defendu" },
    { token: "le fruit defendu", rangeSlug: "le-fruit-defendu" },
    { token: "double dragon", rangeSlug: "double-dragon" },
    { token: "mamita", rangeSlug: "mamita" },
  ],
  airmust: [
    { token: "ferox", rangeSlug: "ferox-airmust" },
    { token: "press start", rangeSlug: "press-start-airmust" },
    { token: "unik", rangeSlug: "unik-airmust" },
    { token: "blue hopper", rangeSlug: "blue-hopper-airmust" },
  ],
  swoke: [
    { token: "force vape", rangeSlug: "force-vape-swoke" },
    { token: "bisou", rangeSlug: "bisou-swoke" },
    { token: "saint flava", rangeSlug: "saint-flava-swoke" },
  ],
  "cloud-vapor": [
    { token: "grand taste city", rangeSlug: "grand-taste-city-cloud-vapor" },
  ],
  "vape-47": [
    { token: "furiosa", rangeSlug: "furiosa-eggz" },
    { token: "les fruits d enfer", rangeSlug: "les-fruits-d-enfer" },
    { token: "fruits d enfer", rangeSlug: "les-fruits-d-enfer" },
    { token: "enfer", rangeSlug: "enfer" },
  ],
  "liquide-lab": [
    { token: "kuix", rangeSlug: "kuix" },
    { token: "glagla", rangeSlug: "glagla" },
    { token: "iceberg", rangeSlug: "iceberg" },
    { token: "peche gourmand", rangeSlug: "peche-gourmand" },
  ],
  "eliquid-france": [
    { token: "fruizee max", rangeSlug: "fruizee-max-eliquid-france" },
    { token: "mintaia", rangeSlug: "mintaia-eliquid-france" },
    { token: "lemon time", rangeSlug: "lemon-time-eliquid-france" },
  ],
  "aromes-secrets": [
    { token: "mythologie", rangeSlug: "mythologie-aromes-secrets" },
  ],
  avap: [{ token: "devil", rangeSlug: "devil-avap" }],
  "juice-66": [{ token: "66 juice", rangeSlug: "66-juice-juice-66" }],
  liquideo: [
    { token: "dragonz", rangeSlug: "dragonzz-liquideo" },
    { token: "dragonzz", rangeSlug: "dragonzz-liquideo" },
  ],
  "t-juice": [
    { token: "t juice", rangeSlug: "t-juice-50-ml" },
    { token: "tjuice", rangeSlug: "t-juice-50-ml" },
  ],
  "the-fuu": [{ token: "cloud empire", rangeSlug: "cloud-empire-the-fuu" }],
  "cookin-cloud": [{ token: "myst", rangeSlug: "myst" }],
};

/** Aliases fabricant certains absents / trop faibles. */
const EXTRA_MFR_NEEDLES: Array<{ slug: string; needles: string[] }> = [
  { slug: "airmust", needles: ["air max must", "airmust"] },
  { slug: "liquide-lab", needles: ["liquide lab", "liquidelab"] },
  { slug: "biarritz-lab", needles: ["biarritz lab", "biarrtiz lab"] },
];

function isEliquideRow(category: string, name: string): boolean {
  const c = category.toLowerCase();
  if (/e-?\s*liquide/.test(c)) return true;
  if (!category && /\b\d+\s*ml\b/i.test(name) && name.length <= 120) return true;
  return false;
}

function coverExists(mfrSlug: string, rangeSlug: string): boolean {
  const dir = path.join(MEDIA, mfrSlug, "ranges");
  return ["webp", "jpg", "jpeg", "png"].some((ext) =>
    fs.existsSync(path.join(dir, `${rangeSlug}.${ext}`))
  );
}

function matchManufacturer(
  productName: string,
  known: ReturnType<typeof loadKnownManufacturers>
): { slug: string; name: string } | null {
  const n = norm(productName);
  const ranked = [...known].sort(
    (a, b) =>
      Math.max(norm(b.name).length, ...b.aliases.map((x) => norm(x).length), 0) -
      Math.max(norm(a.name).length, ...a.aliases.map((x) => norm(x).length), 0)
  );
  for (const m of ranked) {
    const needles = [m.name, ...m.aliases, m.slug.replace(/-/g, " ")]
      .map(norm)
      .filter((x) => x.length >= 3);
    if (needles.some((x) => n.includes(x))) return { slug: m.slug, name: m.name };
  }
  for (const extra of EXTRA_MFR_NEEDLES) {
    if (extra.needles.map(norm).some((x) => n.includes(x))) {
      const m = known.find((k) => k.slug === extra.slug);
      if (m) return { slug: m.slug, name: m.name };
    }
  }
  // Range-only certain → manufacturer (cover exists under that mfr)
  for (const [mfrSlug, ranges] of Object.entries(CERTAIN_RANGE_TOKENS)) {
    // Skip ambiguous Saiyen
    for (const r of ranges) {
      if (r.token === "saiyen vapors") continue;
      if (r.token === "enfer" && !/vape\s*47|enfer/i.test(productName)) continue;
      const tn = norm(r.token);
      if (tn.length >= 4 && n.includes(tn) && coverExists(mfrSlug, r.rangeSlug)) {
        // Only auto-assign manufacturer from range token if token is distinctive (>=5) or explicit
        if (tn.length >= 5 || /kuix|glagla|unik|ferox|bankiz|mintaia/i.test(r.token)) {
          const m = known.find((k) => k.slug === mfrSlug);
          if (m) return { slug: m.slug, name: m.name };
        }
      }
    }
  }
  return null;
}

function matchRange(mfrSlug: string, productName: string): string | null {
  const n = norm(productName);
  const list = CERTAIN_RANGE_TOKENS[mfrSlug] || [];
  // longest token first
  const ranked = [...list].sort((a, b) => b.token.length - a.token.length);
  for (const r of ranked) {
    if (r.token === "saiyen vapors") continue; // ambiguous — do not auto-link
    if (r.token === "freeze" && mfrSlug === "liquideo") {
      // "freeze" alone too broad unless liquideo also present
      if (!/liquideo/i.test(productName)) continue;
    }
    if (r.token === "enfer") {
      // Prefer more specific fruits d'enfer first (already sorted)
      if (!/\benfer\b/i.test(productName)) continue;
    }
    if (r.token === "bisou" && !/\bbisou\b/i.test(productName)) continue;
    if (n.includes(norm(r.token)) && coverExists(mfrSlug, r.rangeSlug)) {
      return r.rangeSlug;
    }
  }
  return null;
}

async function main() {
  const known = loadKnownManufacturers();
  // Ensure liquide-lab in known (from media)
  if (!known.find((k) => k.slug === "liquide-lab")) {
    known.push({ name: "Liquide Lab", slug: "liquide-lab", aliases: ["Liquide Lab"] });
  }

  const rows = parseCsv(fs.readFileSync(CSV, "utf8"));
  let linked = 0;
  let skippedAmbiguous = 0;
  let already = 0;
  let noProduct = 0;
  const samples: string[] = [];

  for (const r of rows) {
    const name = (r["item name"] || "").trim();
    if (!name || name.length > 120 || /https?:\/\//i.test(name)) continue;
    if (!isEliquideRow(r.category || "", name)) continue;

    const mfrHit = matchManufacturer(name, known);
    if (!mfrHit) continue;
    const rangeSlug = matchRange(mfrHit.slug, name);
    if (!rangeSlug) continue;

    const barcode = (r.barcode || "").trim();
    if (!barcode) continue;

    const mfr = await prisma.manufacturer.findUnique({ where: { slug: mfrHit.slug } });
    if (!mfr) continue;
    const range = await prisma.productRange.findFirst({
      where: {
        slug: rangeSlug,
        OR: [{ manufacturerId: mfr.id }, { brand: { slug: mfrHit.slug } }],
      },
    });
    if (!range) {
      skippedAmbiguous += 1;
      continue;
    }

    const product = await prisma.product.findFirst({
      where: { barcode },
      select: {
        id: true,
        name: true,
        manufacturerId: true,
        rangeId: true,
        visibleOnline: true,
      },
    });
    if (!product) {
      noProduct += 1;
      continue;
    }
    if (product.manufacturerId && product.manufacturerId !== mfr.id) {
      skippedAmbiguous += 1;
      continue;
    }
    if (product.rangeId === range.id && product.manufacturerId === mfr.id) {
      already += 1;
      continue;
    }
    if (product.rangeId && product.rangeId !== range.id) {
      skippedAmbiguous += 1;
      continue;
    }

    await prisma.product.update({
      where: { id: product.id },
      data: {
        manufacturerId: mfr.id,
        brandId: range.brandId,
        brand: mfr.name,
        rangeId: range.id,
        range: range.name,
      },
    });
    linked += 1;
    if (samples.length < 25) samples.push(`${name} → ${mfrHit.slug}/${rangeSlug}`);
  }

  console.log(
    JSON.stringify({ linked, already, skippedAmbiguous, noProduct, samples }, null, 2)
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
