/**
 * Réimplantation photos Liquidarom → Ice Cool / Ice Cool X → produit.
 *
 * - Efface photos PRODUIT des gammes ice-cool / ice-cool-x uniquement
 * - Réimplante depuis C:\Users\ASUS\Pictures\liquidarom avec style e-tasty
 * - Ne touche PAS stock, logos fabricant, covers de gamme
 *
 * Usage:
 *   npx tsx scripts/reimplant-liquidarom-ice-cool-photos.ts --dry-run
 *   npx tsx scripts/reimplant-liquidarom-ice-cool-photos.ts --apply
 */
import fs from "node:fs";
import path from "node:path";
import "./load-env";
import prisma from "../lib/prisma";
import { normalizeProductImageToEtastyStyle } from "../lib/catalog/normalize-product-image";

const APPLY = process.argv.includes("--apply");
const SOURCE_ROOT = "C:\\Users\\ASUS\\Pictures\\liquidarom";
const MEDIA_PRODUCTS = path.resolve("public/media/products/liquidarom");
const REPORT_PATH = path.resolve("data/rebuild/REIMPLANT_LIQUIDAROM_ICE_COOL_PHOTOS.json");

const EN_FR: Record<string, string> = {
  "blackberry-raspberry": "mure-framboise",
  "blackcurrant-raspberry-grape": "cassis-framboise-raisin",
  "blue-raspberry-pitaya": "framboise-bleue-pitaya",
  "mixed-red-berries": "fruits-rouges",
  "watermelon-lemon": "pasteque-citron",
};

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function flavorFromFilename(file: string, isX: boolean) {
  let base = path.basename(file, path.extname(file));
  base = base.replace(/^e-liquide-/, "");
  if (isX) base = base.replace(/-50ml-ice-cool-x$/i, "");
  else base = base.replace(/-50ml-ice-cool$/i, "");
  return norm(base);
}

function flavorFromProductName(name: string) {
  let s = name.toLowerCase();
  s = s.replace(/liquidarom/gi, " ");
  s = s.replace(/ice\s*cool\s*x?/gi, " ");
  s = s.replace(/\b\d+\s*ml\b/gi, " ");
  s = s.replace(/\b\d+\s*mg\b/gi, " ");
  s = s.replace(/\be-?liquide\b/gi, " ");
  return norm(s);
}

function isIceCoolX(p: {
  name: string;
  productFamily: string | null;
  slug: string;
  range: string | null;
}) {
  return (
    /ice\s*cool\s*x/i.test(p.name) ||
    p.productFamily === "ICE_COOL_X" ||
    /ice-cool-x/i.test(p.slug || "") ||
    /ice\s*cool\s*x/i.test(p.range || "")
  );
}

function scoreFlavor(fileFlavor: string, productName: string) {
  const pf = flavorFromProductName(productName);
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

/** Préfère fiche propre hiérarchie (sans préfixe Liquidarom - … répété). */
function pickPrimary(
  products: Array<{ id: string; name: string; visibleOnline: boolean; imageUrl: string | null }>,
) {
  const ranked = [...products].sort((a, b) => {
    const aLong = /^liquidarom\s*-/i.test(a.name) ? 1 : 0;
    const bLong = /^liquidarom\s*-/i.test(b.name) ? 1 : 0;
    if (aLong !== bLong) return aLong - bLong; // short first
    if (a.visibleOnline !== b.visibleOnline) return a.visibleOnline ? -1 : 1;
    return a.name.length - b.name.length;
  });
  return ranked[0];
}

async function clearRangeProductPhotos(productIds: string[]) {
  if (!productIds.length) return { clearedDb: 0, deletedImages: 0 };
  const images = await prisma.productImage.deleteMany({
    where: { productId: { in: productIds } },
  });
  const updated = await prisma.product.updateMany({
    where: { id: { in: productIds } },
    data: {
      imageUrl: null,
      imageStatus: "pending",
      // stock INTENTIONNELLEMENT omis
    },
  });
  return { clearedDb: updated.count, deletedImages: images.count };
}

function wipeProductMediaDir(rangeSlug: "ice-cool" | "ice-cool-x") {
  const dir = path.join(MEDIA_PRODUCTS, rangeSlug);
  if (!fs.existsSync(dir)) return { removed: 0, dir };
  const backupRoot = path.join(
    MEDIA_PRODUCTS,
    "_backup_reimplant",
    rangeSlug,
    new Date().toISOString().replace(/[:.]/g, "-"),
  );
  let removed = 0;
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(webp|jpe?g|png)$/i.test(entry.name)) continue;
      const rel = path.relative(dir, full);
      const dest = path.join(backupRoot, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(full, dest);
      fs.unlinkSync(full);
      removed++;
    }
  };
  walk(dir);
  return { removed, dir, backupRoot };
}

async function main() {
  const liquidarom = await prisma.manufacturer.findFirst({
    where: { slug: "liquidarom" },
    select: { id: true, name: true, slug: true },
  });
  if (!liquidarom) throw new Error("Manufacturer liquidarom introuvable");

  const ranges = await prisma.productRange.findMany({
    where: { slug: { in: ["ice-cool", "ice-cool-x"] }, manufacturerId: liquidarom.id },
    select: { id: true, slug: true, name: true },
  });
  const iceCool = ranges.find((r) => r.slug === "ice-cool");
  const iceCoolX = ranges.find((r) => r.slug === "ice-cool-x");
  if (!iceCool || !iceCoolX) throw new Error("Gammes ice-cool / ice-cool-x introuvables");

  const folders: Array<{
    key: "ice-cool" | "ice-cool-x";
    rangeId: string;
    dir: string;
  }> = [
    { key: "ice-cool", rangeId: iceCool.id, dir: path.join(SOURCE_ROOT, "ice cool") },
    { key: "ice-cool-x", rangeId: iceCoolX.id, dir: path.join(SOURCE_ROOT, "ice cool x") },
  ];

  const allRangeProducts = await prisma.product.findMany({
    where: {
      OR: [
        { rangeId: { in: [iceCool.id, iceCoolX.id] } },
        { productFamily: { in: ["ICE_COOL", "ICE_COOL_X"] } },
        { name: { contains: "Ice Cool", mode: "insensitive" } },
      ],
      manufacturerId: liquidarom.id,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      imageUrl: true,
      imageStatus: true,
      productFamily: true,
      range: true,
      rangeId: true,
      manufacturerId: true,
      visibleOnline: true,
      stock: true,
    },
  });

  const inScope = allRangeProducts.filter((p) => {
    const x = isIceCoolX(p);
    if (x) return p.rangeId === iceCoolX.id || p.productFamily === "ICE_COOL_X" || /ice\s*cool\s*x/i.test(p.name);
    return (
      !x &&
      (p.rangeId === iceCool.id ||
        p.productFamily === "ICE_COOL" ||
        (/ice\s*cool/i.test(p.name) && !/ice\s*cool\s*x/i.test(p.name)))
    );
  });

  const report: any = {
    date: new Date().toISOString(),
    mode: APPLY ? "apply" : "dry-run",
    hierarchy: "Liquidarom → Ice Cool|Ice Cool X → produit 50ml",
    untouched: {
      stock: true,
      manufacturerLogo: true,
      rangeCovers: true,
      otherLiquidaromRanges: true,
    },
    clear: null as any,
    mediaWipe: null as any,
    implanted: [] as any[],
    skippedFiles: [] as any[],
    productsWithoutNewPhoto: [] as string[],
  };

  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  console.log(`Produits scope Liquidarom Ice Cool*: ${inScope.length}`);

  if (APPLY) {
    report.clear = await clearRangeProductPhotos(inScope.map((p) => p.id));
    report.mediaWipe = {
      "ice-cool": wipeProductMediaDir("ice-cool"),
      "ice-cool-x": wipeProductMediaDir("ice-cool-x"),
    };
    console.log("Cleared DB photos:", report.clear);
    console.log("Wiped media:", report.mediaWipe);
  } else {
    report.clear = {
      wouldClearProducts: inScope.length,
      withImage: inScope.filter((p) => p.imageUrl).length,
    };
    report.mediaWipe = { dryRun: true, dirs: ["ice-cool", "ice-cool-x"] };
  }

  const linkedIds = new Set<string>();

  for (const folder of folders) {
    const isX = folder.key === "ice-cool-x";
    const files = fs
      .readdirSync(folder.dir)
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
      .map((f) => path.join(folder.dir, f));

    const rangeProducts = inScope.filter((p) =>
      isX ? isIceCoolX(p) : !isIceCoolX(p),
    );

    for (const file of files) {
      const flavor = flavorFromFilename(file, isX);
      const scored = rangeProducts
        .map((p) => ({ p, score: scoreFlavor(flavor, p.name) }))
        .filter((x) => x.score >= 0.5)
        .sort((a, b) => b.score - a.score);

      if (!scored.length) {
        report.skippedFiles.push({
          file: path.basename(file),
          flavor,
          reason: "aucun produit fabricant→gamme→saveur",
        });
        continue;
      }

      // Tous les matchs fort (≥0.7) + au minimum le primary
      const strong = scored.filter((x) => x.score >= 0.7);
      const targets = (strong.length ? strong : scored.slice(0, 1)).map((x) => x.p);
      const primary = pickPrimary(targets);

      const outRel = path.join(
        "liquidarom",
        folder.key,
        "50ml",
        `${flavor}.webp`,
      );
      const outPath = path.join(path.resolve("public/media/products"), outRel);
      const publicUrl = `/media/products/${outRel.split(path.sep).join("/")}`;

      if (APPLY) {
        await normalizeProductImageToEtastyStyle({
          inputBuffer: fs.readFileSync(file),
          outPath,
          flavorHint: `${flavor} ${folder.key} liquidarom ${primary.name}`,
          keepNativeFruits: false,
        });

        for (const t of targets) {
          const existingImg = await prisma.productImage.findFirst({
            where: { productId: t.id, sortOrder: 0 },
          });
          if (existingImg) {
            await prisma.productImage.update({
              where: { id: existingImg.id },
              data: { url: publicUrl, status: "official" },
            });
          } else {
            await prisma.productImage.create({
              data: {
                productId: t.id,
                url: publicUrl,
                status: "official",
                sortOrder: 0,
                alt: t.name,
              },
            });
          }
          await prisma.product.update({
            where: { id: t.id },
            data: {
              imageUrl: publicUrl,
              imageStatus: "official",
              manufacturerId: liquidarom.id,
              rangeId: folder.rangeId,
              range: isX ? "Ice Cool X" : "Ice Cool",
              brand: "Liquidarom",
              productFamily: isX ? "ICE_COOL_X" : "ICE_COOL",
              // stock non touché
            },
          });
          linkedIds.add(t.id);
        }
      } else {
        for (const t of targets) linkedIds.add(t.id);
      }

      report.implanted.push({
        hierarchy: `Liquidarom → ${isX ? "Ice Cool X" : "Ice Cool"} → ${flavor} 50ml`,
        file: path.basename(file),
        flavor,
        publicUrl,
        primary: primary.name,
        linkedProducts: targets.map((t) => ({
          id: t.id,
          name: t.name,
          score: scored.find((s) => s.p.id === t.id)?.score,
        })),
      });
      console.log(
        `${APPLY ? "[ok]" : "[dry]"} Liquidarom → ${folder.key} → ${flavor} → ${targets.length} produit(s)`,
      );
    }
  }

  report.productsWithoutNewPhoto = inScope
    .filter((p) => !linkedIds.has(p.id))
    .map((p) => p.name);

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  console.log(`\nReport: ${REPORT_PATH}`);
  console.log(
    JSON.stringify(
      {
        mode: report.mode,
        implanted: report.implanted.length,
        skippedFiles: report.skippedFiles,
        withoutPhoto: report.productsWithoutNewPhoto.length,
      },
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
