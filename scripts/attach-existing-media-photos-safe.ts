/**
 * Attache les photos DÉJÀ présentes sous public/media/products
 * aux produits catalogue — règle existante (reimplant Ice Cool) :
 * fabricant → gamme → saveur, score ≥ 0.7 = certain.
 *
 * Ne modifie PAS : name, prix, stock, fabricant, gamme, format.
 * Met à jour uniquement : imageUrl, imageStatus, ProductImage.
 *
 * Usage:
 *   npx tsx scripts/attach-existing-media-photos-safe.ts --dry-run
 *   npx tsx scripts/attach-existing-media-photos-safe.ts --apply
 */
import fs from "node:fs";
import path from "node:path";
import "./load-env";
import prisma from "../lib/prisma";

const APPLY = process.argv.includes("--apply");
const ROOT = process.cwd();
const MEDIA = path.join(ROOT, "public", "media", "products");
const REPORT = path.join(ROOT, "data/rebuild/ATTACH_EXISTING_MEDIA_PHOTOS.json");

/** Aligné sur scripts/reimplant-liquidarom-ice-cool-photos.ts */
const CERTAIN = 0.7;
const CANDIDATE = 0.5;

const EN_FR: Record<string, string> = {
  "blackberry-raspberry": "mure-framboise",
  "blackcurrant-raspberry-grape": "cassis-framboise-raisin",
  "blue-raspberry-pitaya": "framboise-bleue-pitaya",
  "mixed-red-berries": "fruits-rouges",
  "mixed-berries": "fruits-rouges",
  "watermelon-lemon": "pasteque-citron",
};

type RangeCfg = {
  mfrSlug: string;
  mfrName: string;
  rangeSlug: string;
  rangeName: string;
};

const RANGES: RangeCfg[] = [
  { mfrSlug: "liquidarom", mfrName: "Liquidarom", rangeSlug: "ice-cool", rangeName: "Ice Cool" },
  { mfrSlug: "liquidarom", mfrName: "Liquidarom", rangeSlug: "ice-cool-x", rangeName: "Ice Cool X" },
  { mfrSlug: "liquidarom", mfrName: "Liquidarom", rangeSlug: "les-collegues", rangeName: "Les Collègues" },
  { mfrSlug: "liquidarom", mfrName: "Liquidarom", rangeSlug: "les-essentiels", rangeName: "Les Essentiels" },
  { mfrSlug: "liquidarom", mfrName: "Liquidarom", rangeSlug: "replay", rangeName: "Replay" },
  { mfrSlug: "cloud-vapor", mfrName: "Cloud Vapor", rangeSlug: "hellfest", rangeName: "Hellfest" },
  { mfrSlug: "cloud-vapor", mfrName: "Cloud Vapor", rangeSlug: "kung-freeze", rangeName: "Kung Freeze" },
  { mfrSlug: "cloud-vapor", mfrName: "Cloud Vapor", rangeSlug: "call-of-vape", rangeName: "Call of Vape" },
];

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Identique à reimplant-liquidarom-ice-cool-photos.ts */
function flavorFromProductName(name: string, rangeName: string, mfrName: string) {
  let s = name.toLowerCase();
  s = s.replace(new RegExp(mfrName, "gi"), " ");
  s = s.replace(new RegExp(rangeName, "gi"), " ");
  s = s.replace(/ice\s*cool\s*x?/gi, " ");
  s = s.replace(/\b\d+\s*ml\b/gi, " ");
  s = s.replace(/\b\d+\s*mg\b/gi, " ");
  s = s.replace(/\be-?liquide\b/gi, " ");
  return norm(s);
}

function scoreFlavor(fileFlavor: string, productName: string, rangeName: string, mfrName: string) {
  const pf = flavorFromProductName(productName, rangeName, mfrName);
  const alt = EN_FR[fileFlavor] || fileFlavor;
  let best = 0;
  for (const fl of [fileFlavor, alt]) {
    const a = fl.split("-").filter(Boolean);
    const b = pf.split("-").filter(Boolean);
    if (!a.length || !b.length) continue;
    const inter = a.filter((t) => b.includes(t)).length;
    const score = inter / Math.max(a.length, b.length);
    const sub = pf.includes(fl) || fl.includes(pf) ? 0.95 : 0;
    best = Math.max(best, score, sub);
  }
  return best;
}

function listFlavorWebps(mfrSlug: string, rangeSlug: string) {
  const root = path.join(MEDIA, mfrSlug, rangeSlug);
  const out: Array<{ flavor: string; publicUrl: string; abs: string }> = [];
  if (!fs.existsSync(root)) return out;
  const walk = (dir: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (/_backup/i.test(ent.name)) continue;
        walk(full);
        continue;
      }
      if (!/\.webp$/i.test(ent.name) || /-thumb\.webp$/i.test(ent.name)) continue;
      const flavor = norm(ent.name.replace(/\.webp$/i, ""));
      const rel =
        "/" +
        path
          .relative(path.join(ROOT, "public"), full)
          .split(path.sep)
          .join("/");
      out.push({ flavor, publicUrl: rel, abs: full });
    }
  };
  walk(root);
  return out;
}

async function main() {
  const photosFound: string[] = [];
  const attached: unknown[] = [];
  const alreadyHad: unknown[] = [];
  const ambiguous: unknown[] = [];
  const noMatch: unknown[] = [];
  const withoutPhotoAfter: unknown[] = [];

  let attachedCount = 0;

  for (const cfg of RANGES) {
    const files = listFlavorWebps(cfg.mfrSlug, cfg.rangeSlug);
    for (const f of files) photosFound.push(f.publicUrl);

    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        OR: [
          { manufacturer: { slug: cfg.mfrSlug }, rangeRef: { slug: cfg.rangeSlug } },
          { manufacturer: { slug: cfg.mfrSlug }, range: cfg.rangeName },
        ],
      },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        visibleOnline: true,
        stock: true,
        priceCents: true,
      },
    });

    const usedProducts = new Set<string>();
    const usedFiles = new Set<string>();

    for (const file of files) {
      const scored = products
        .filter((p) => !usedProducts.has(p.id))
        .map((p) => ({
          p,
          score: scoreFlavor(file.flavor, p.name, cfg.rangeName, cfg.mfrName),
        }))
        .filter((x) => x.score >= CANDIDATE)
        .sort((a, b) => b.score - a.score);

      if (!scored.length) {
        noMatch.push({
          hierarchy: `${cfg.mfrName} → ${cfg.rangeName} → ${file.flavor}`,
          publicUrl: file.publicUrl,
          reason: "aucun produit saveur≥0.5",
        });
        continue;
      }

      const best = scored[0]!;
      const second = scored[1];
      const certain =
        best.score >= CERTAIN && (!second || best.score - second.score >= 0.05 || second.score < CERTAIN);

      if (!certain) {
        ambiguous.push({
          hierarchy: `${cfg.mfrName} → ${cfg.rangeName} → ${file.flavor}`,
          publicUrl: file.publicUrl,
          best: { id: best.p.id, name: best.p.name, score: best.score },
          second: second
            ? { id: second.p.id, name: second.p.name, score: second.score }
            : null,
        });
        continue;
      }

      usedProducts.add(best.p.id);
      usedFiles.add(file.publicUrl);

      const already =
        best.p.imageUrl === file.publicUrl ||
        (best.p.imageUrl &&
          fs.existsSync(path.join(ROOT, "public", best.p.imageUrl.replace(/^\//, ""))));

      if (best.p.imageUrl === file.publicUrl) {
        alreadyHad.push({
          productId: best.p.id,
          name: best.p.name,
          publicUrl: file.publicUrl,
          score: best.score,
        });
        continue;
      }

      // Si déjà une image fichier valide différente → ne pas écraser (ambiguïté)
      if (
        best.p.imageUrl &&
        best.p.imageUrl.startsWith("/media/") &&
        fs.existsSync(path.join(ROOT, "public", best.p.imageUrl.replace(/^\//, "")))
      ) {
        alreadyHad.push({
          productId: best.p.id,
          name: best.p.name,
          publicUrl: best.p.imageUrl,
          keptExisting: true,
          candidate: file.publicUrl,
          score: best.score,
        });
        continue;
      }

      attached.push({
        productId: best.p.id,
        name: best.p.name,
        publicUrl: file.publicUrl,
        score: best.score,
        stockUntouched: best.p.stock,
        priceUntouched: best.p.priceCents,
      });

      if (APPLY) {
        await prisma.product.update({
          where: { id: best.p.id },
          data: {
            imageUrl: file.publicUrl,
            imageStatus: "validated",
            // name / prix / stock / manufacturer / range INTENTIONNELLEMENT omis
          },
        });
        await prisma.productImage.deleteMany({ where: { productId: best.p.id } });
        await prisma.productImage.create({
          data: {
            productId: best.p.id,
            url: file.publicUrl,
            status: "validated",
            sortOrder: 0,
            alt: best.p.name,
          },
        });
      }
      attachedCount++;
    }

    for (const p of products) {
      if (usedProducts.has(p.id)) continue;
      const hasFile =
        p.imageUrl &&
        p.imageUrl.startsWith("/media/") &&
        fs.existsSync(path.join(ROOT, "public", p.imageUrl.replace(/^\//, "")));
      if (!hasFile && p.visibleOnline) {
        withoutPhotoAfter.push({
          productId: p.id,
          name: p.name,
          range: cfg.rangeName,
          manufacturer: cfg.mfrName,
          imageUrl: p.imageUrl,
        });
      }
    }
  }

  // duo-de-cerises source présente mais media manquant ?
  const duoSrc = "C:\\Users\\ASUS\\Pictures\\liquidarom\\ice cool\\e-liquide-duo-de-cerises-50ml-ice-cool.jpg";
  const duoMedia = path.join(MEDIA, "liquidarom", "ice-cool", "50ml", "duo-de-cerises.webp");
  const missingSourceNotes: string[] = [];
  if (fs.existsSync(duoSrc) && !fs.existsSync(duoMedia)) {
    missingSourceNotes.push(
      "Source Pictures présente pour duo-de-cerises mais webp media absent — signalé, non généré ici (pas de fausse photo).",
    );
  }

  const report = {
    date: new Date().toISOString(),
    mode: APPLY ? "apply" : "dry-run",
    rule: {
      source: "scripts/reimplant-liquidarom-ice-cool-photos.ts + .cursor/rules/catalog-image-folder-triage.mdc",
      hierarchy: "fabricant → gamme → saveur",
      certainScore: CERTAIN,
      candidateScore: CANDIDATE,
      untouched: ["name", "priceCents", "stock", "manufacturerId", "rangeId", "productType"],
    },
    totals: {
      photosFound: photosFound.length,
      uniquePhotos: new Set(photosFound).size,
      productsAttached: attachedCount,
      alreadyHadImage: alreadyHad.length,
      ambiguous: ambiguous.length,
      unmatchedPhotos: noMatch.length,
      productsStillWithoutPhoto: withoutPhotoAfter.length,
    },
    missingSourceNotes,
    attached,
    alreadyHad,
    ambiguous,
    unmatchedPhotos: noMatch,
    productsStillWithoutPhoto: withoutPhotoAfter,
  };

  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ mode: report.mode, ...report.totals, report: REPORT }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
