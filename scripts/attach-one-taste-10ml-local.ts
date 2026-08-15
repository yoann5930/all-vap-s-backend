/**
 * Classe les e.Tasty 10 ml officiels One Taste + associe les packshots
 * déjà présents dans public/media/products/e-tasty/one-taste/10ml/.
 *
 * - Pas d'invention de nom / photo / EAN
 * - Pas de téléchargement
 * - Pas d'écriture SumUp ni de mouvement de stock
 *
 * npx tsx scripts/attach-one-taste-10ml-local.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { evaluateEliquidePublishGate } from "../lib/catalog/official-sumup-policy";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MEDIA_DIR = path.join(REPO_ROOT, "public/media/products/e-tasty/one-taste/10ml");
const OFFICIAL_JSON = path.join(REPO_ROOT, "data/rebuild/ETASTY_ONE_TASTE_10ML_OFFICIAL.json");
const REPORT = path.join(REPO_ROOT, "data/rebuild/RAPPORT_ONE_TASTE_10ML_OFFRE.json");

const SKIP_RANGE = [/harrison/i, /pomme\s*croquante/i];
const SKIP_PUBLISH_PHOTO = [/barbe\s*a\s*papa/i];

type Official10 = {
  title: string;
  flavorKey: string;
  imageUrl: string;
  productUrl: string;
  ean: string | null;
  isSalt: boolean;
};

function loadEnvFile(file: string): Record<string, string> {
  const raw = fs.readFileSync(file, "utf8");
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function extractPostgresUrl(raw: string): string {
  let v = raw.trim().replace(/^\uFEFF/, "");
  const embedded = v.match(/postgres(?:ql)?:\/\/\S+/i);
  if (embedded) return embedded[0].replace(/[.,;]+$/, "");
  return v;
}

function slugify(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function norm(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/carnival/g, "carnaval")
    .replace(/sauvege/g, "sauvage")
    .replace(/givree|givre/g, "givre")
    .replace(/doree|dore/g, "dore")
    .replace(/\bpopcorn\b/g, "pop corn")
    .replace(/sel(s)?\s*(de\s*)?nicotine/g, " ")
    .replace(/\bsels?\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isETasty(name: string): boolean {
  return /e[-\s]?tasty|etasty/i.test(name);
}

function is10ml(name: string, category: string, productType: string | null, volumeMl: number | null): boolean {
  if (volumeMl === 10 || productType === "10ml") return true;
  const t = `${name} ${category}`.toLowerCase();
  if (/\b100\s*ml\b/.test(t) || /\b50\s*ml\b/.test(t) || /\b30\s*ml\b/.test(t) || /\b20\s*ml\b/.test(t)) {
    return false;
  }
  return /\b10\s*ml\b|05\.e-liquide\s*10/.test(t);
}

function detectNicotine(name: string): { mg: number | null; isSalt: boolean } {
  const isSalt = /sel(s)?\s*(de\s*)?nicotine/i.test(name);
  const m = name.match(/\b(\d+)\s*mg\b/i);
  return { mg: m ? Number(m[1]) : null, isSalt };
}

function extractFlavor(name: string): string {
  return name
    .replace(/e[-\s]?tasty|etasty/gi, " ")
    .replace(/one\s*taste/gi, " ")
    .replace(/([a-zàâäéèêëïîôùûüç])(\d+\s*ml)/gi, "$1 $2")
    .replace(/\b\d+\s*ml\b/gi, " ")
    .replace(/\b\d+\s*mg\b/gi, " ")
    .replace(/sel(s)?\s*(de\s*)?nicotine/gi, " ")
    .replace(/[-_/|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shouldSkipRange(name: string, flavor: string): boolean {
  const t = `${name} ${flavor}`;
  return SKIP_RANGE.some((re) => re.test(t));
}

function matchOfficial(official: Official10[], flavor: string, isSalt: boolean): Official10 | null {
  const fk = norm(flavor);
  if (!fk || fk.length < 3) return null;
  let best: Official10 | null = null;
  let bestScore = 0;
  for (const o of official) {
    const ok = norm(o.flavorKey);
    if (!ok || ok.length < 3) continue;
    const saltPenalty = o.isSalt === isSalt ? 0 : -25;
    let score = 0;
    if (ok === fk) score = 100;
    else if (ok.includes(fk) || fk.includes(ok)) {
      const shorter = ok.length < fk.length ? ok : fk;
      const longer = ok.length >= fk.length ? ok : fk;
      if (shorter.length / longer.length < 0.7) continue;
      score = 80;
    } else {
      const a = new Set(fk.split(" ").filter((x) => x.length > 2));
      const b = new Set(ok.split(" ").filter((x) => x.length > 2));
      const inter = [...a].filter((x) => b.has(x));
      if (!inter.length) continue;
      score = (inter.length / Math.max(a.size, b.size)) * 70;
    }
    score += saltPenalty;
    if (score > bestScore) {
      bestScore = score;
      best = o;
    }
  }
  return bestScore >= 70 ? best : null;
}

function listLocal10ml(): string[] {
  if (!fs.existsSync(MEDIA_DIR)) return [];
  return fs.readdirSync(MEDIA_DIR).filter((f) => {
    if (!/\.webp$/i.test(f)) return false;
    if (/thumb|-\d+w\./i.test(f)) return false;
    if (/50ml|100ml|50-ml|100-ml/i.test(f) && !/10ml|10-ml/i.test(f)) return false;
    return true;
  });
}

function findLocalPhoto(
  files: string[],
  flavorKey: string,
  nicMg: number | null
): string | null {
  const flavorSlug = slugify(flavorKey);
  if (!flavorSlug || flavorSlug.length < 3) return null;
  const re = new RegExp(`(^|-)${flavorSlug}-10ml(-|$)`);
  const matches = files.filter((f) => re.test(f.replace(/\.webp$/i, "")));
  if (!matches.length) return null;
  if (nicMg != null) {
    const nicRe = new RegExp(`(^|-)${nicMg}mg(-|$)`);
    const nicHit = matches.find((f) => nicRe.test(f.replace(/\.webp$/i, "")));
    if (nicHit) return `/media/products/e-tasty/one-taste/10ml/${nicHit}`;
  }
  return `/media/products/e-tasty/one-taste/10ml/${matches[0]}`;
}

async function main() {
  const env = loadEnvFile(path.join(REPO_ROOT, ".env.render.audit"));
  const prisma = new PrismaClient({
    datasources: { db: { url: extractPostgresUrl(env.DATABASE_URL || "") } },
    log: ["error"],
  });

  const official = (
    JSON.parse(fs.readFileSync(OFFICIAL_JSON, "utf8")) as { items: Official10[] }
  ).items.map((o) => ({ ...o, flavorKey: norm(o.flavorKey) }));

  const files = listLocal10ml();
  console.log(`Officiel One Taste 10 ml : ${official.length}`);
  console.log(`Photos locales 10 ml : ${files.length}`);

  try {
    const db = await prisma.$queryRaw<Array<{ d: string }>>`SELECT current_database() AS d`;
    if (db[0]?.d !== "all_vaps_db") throw new Error("wrong db");

    const manufacturer = await prisma.manufacturer.findUnique({ where: { slug: "e-tasty" } });
    const brand = await prisma.brand.findUnique({ where: { slug: "e-tasty" } });
    const oneTaste = await prisma.productRange.findFirst({
      where: { slug: "one-taste", manufacturerId: manufacturer?.id },
    });
    if (!manufacturer || !brand || !oneTaste) {
      throw new Error("Référentiel e.Tasty / One Taste manquant");
    }

    const all = await prisma.product.findMany({
      where: {
        OR: [
          { brand: "e.Tasty" },
          { manufacturerId: manufacturer.id },
          { name: { contains: "tasty", mode: "insensitive" } },
        ],
      },
      include: { variants: true, catalogImages: true },
    });

    const products = all.filter(
      (p) =>
        (isETasty(p.name) || isETasty(p.sumupName || "") || p.brand === "e.Tasty") &&
        is10ml(p.name, p.category, p.productType, p.volumeMl)
    );

    const report = {
      date: new Date().toISOString(),
      found10ml: products.length,
      classified: 0,
      published: 0,
      photosLinked: 0,
      skippedNotOfficial: [] as string[],
      skippedNoPhoto: [] as string[],
      skippedForbidden: [] as string[],
      publishedSample: [] as Array<{ name: string; slug: string; imageUrl: string | null }>,
    };

    for (const p of products) {
      const nic = detectNicotine(p.name);
      const flavor = extractFlavor(p.name);

      if (shouldSkipRange(p.name, flavor)) {
        report.skippedForbidden.push(p.name);
        continue;
      }

      const hit = matchOfficial(official, flavor, nic.isSalt);
      if (!hit) {
        report.skippedNotOfficial.push(p.name);
        continue;
      }

      const skipUnreliablePhoto = SKIP_PUBLISH_PHOTO.some((re) => re.test(`${p.name} ${flavor}`));
      const local = skipUnreliablePhoto
        ? null
        : findLocalPhoto(files, hit.flavorKey, nic.mg) || findLocalPhoto(files, flavor, nic.mg);
      const abs = local ? path.join(REPO_ROOT, "public", local.replace(/^\//, "")) : "";
      const fileOk = !!local && fs.existsSync(abs);
      const imageUrl = fileOk ? local : null;
      const imageStatus = fileOk ? "official" : "pending";

      if (fileOk) {
        report.photosLinked++;
        const exists = p.catalogImages.find((i) => i.url === local);
        if (!exists && local) {
          await prisma.productImage.create({
            data: {
              productId: p.id,
              url: local,
              status: "official",
              sortOrder: 0,
              alt: `One Taste — ${flavor} 10 ml`,
            },
          });
        }
      } else {
        report.skippedNoPhoto.push(p.name);
      }

      const sumupName = p.sumupName?.trim() || p.name;
      const gate = evaluateEliquidePublishGate({
        category: p.category || "05.E-liquide 10ml",
        productType: "10ml",
        volumeMl: 10,
        name: p.name,
        sumupName,
        sumupProductId: p.sumupProductId,
        imageStatus,
        imageUrl,
        priceCents: p.priceCents,
      });
      const canPublish = gate.canPublishOnline && fileOk;

      await prisma.product.update({
        where: { id: p.id },
        data: {
          manufacturerId: manufacturer.id,
          brandId: brand.id,
          brand: "e.Tasty",
          rangeId: oneTaste.id,
          range: "One Taste",
          productFamily: "ETASTY_ONE_TASTE",
          productType: "10ml",
          volumeMl: 10,
          category: p.category || "05.E-liquide 10ml",
          sumupName,
          imageUrl,
          imageStatus,
          catalogStatus: canPublish ? "valide" : "a_verifier",
          visibleOnline: canPublish,
          isActive: canPublish ? true : p.isActive,
          promotion10mlEligible: canPublish,
          importAnomaly: canPublish ? null : gate.reasons.join("|") || "photo_10ml_officielle_manquante",
        },
      });

      report.classified++;
      if (canPublish) {
        report.published++;
        if (report.publishedSample.length < 20) {
          report.publishedSample.push({ name: p.name, slug: p.slug, imageUrl });
        }
      }
    }

    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2), "utf8");
    console.log(
      JSON.stringify(
        {
          found10ml: report.found10ml,
          classified: report.classified,
          published: report.published,
          photosLinked: report.photosLinked,
          skippedNotOfficial: report.skippedNotOfficial.length,
          skippedNoPhoto: report.skippedNoPhoto.length,
          skippedForbidden: report.skippedForbidden.length,
          report: REPORT,
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
