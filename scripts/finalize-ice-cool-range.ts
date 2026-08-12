/**
 * Finalise Ice Cool / Ice Cool X :
 * - fusionne quasi-doublons (pomme vert(e) orange, mixed berries)
 * - sort de la gamme les saveurs hors photothèque implantée (garde SumUp hors ligne)
 *
 * Usage:
 *   npx tsx scripts/finalize-ice-cool-range.ts --dry-run
 *   npx tsx scripts/finalize-ice-cool-range.ts --apply
 */
import fs from "node:fs";
import path from "node:path";
import "./load-env";
import prisma from "../lib/prisma";
import { quarantineDuplicateProduct } from "../lib/catalog/assert-no-duplicates";

const APPLY = process.argv.includes("--apply");
const REPORT = path.resolve("data/rebuild/FINALIZE_ICE_COOL_RANGE.json");
const MEDIA_ROOT = path.resolve("public/media/products/liquidarom");

/** Saveurs officielles = fichiers photo implantés */
const OFFICIAL: Record<"ice-cool" | "ice-cool-x", string[]> = {
  "ice-cool": [
    "ananas-kiwi-jaune",
    "cactus-fruit-du-dragon-aloe-vera",
    "cactus-aloe-vera-fruit-du-dragon",
    "cassis-citron",
    "cassis-framboise-raisin",
    "cassis-mangue",
    "citron-pasteque",
    "citron-vert-orange-sanguine",
    "cocktail-exotique",
    "cola-pomme",
    "extra-fruits-rouges",
    "fraise-framboise-basilic",
    "framboise-bleue-pitaya",
    "framboise-fraise-des-bois",
    "fruit-du-dragon-fruits-rouges",
    "fruit-du-serpent-framboise",
    "fruit-du-soleil-levant-grenade",
    "grenade-tropicale",
    "kiwi-banane",
    "mangue-passion",
    "mure-framboise",
    "pasteque-fruits-rouges",
    "pomme-verte-orange",
    "pomme-vert-orange",
  ],
  "ice-cool-x": [
    "blackberry-raspberry",
    "blackcurrant-raspberry-grape",
    "blue-raspberry-pitaya",
    "mixed-red-berries",
    "mixed-berries",
    "watermelon-lemon",
  ],
};

const ALIAS: Record<string, string> = {
  "pomme-vert-orange": "pomme-verte-orange",
  "mixed-berries": "mixed-red-berries",
  "cactus-aloe-vera-fruit-du-dragon": "cactus-fruit-du-dragon-aloe-vera",
  "framboise-des-bois": "framboise-fraise-des-bois",
};

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function isX(p: { name: string; productFamily: string | null; range: string | null }) {
  return (
    /ice\s*cool\s*x/i.test(p.name) ||
    p.productFamily === "ICE_COOL_X" ||
    /ice\s*cool\s*x/i.test(p.range || "")
  );
}

function flavorKey(name: string) {
  let f = norm(
    name
      .replace(/liquidarom/gi, " ")
      .replace(/ice\s*cool\s*x?/gi, " ")
      .replace(/\b\d+\s*ml\b/gi, " ")
      .replace(/\b\d+\s*mg\b/gi, " ")
      .replace(/&/g, " ")
      .replace(/\be-?liquide\b/gi, " "),
  );
  // normalize word order for cactus
  if (f.includes("cactus") && f.includes("aloe") && f.includes("dragon")) {
    f = "cactus-fruit-du-dragon-aloe-vera";
  }
  return ALIAS[f] || f;
}

function titleFlavor(key: string) {
  return key
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function photoFor(rangeSlug: "ice-cool" | "ice-cool-x", flavor: string): string | null {
  const candidates = [flavor];
  if (flavor === "cactus-fruit-du-dragon-aloe-vera") {
    candidates.push("cactus-fruit-du-dragon-aloe-vera");
  }
  for (const c of candidates) {
    const abs = path.join(MEDIA_ROOT, rangeSlug, "50ml", `${c}.webp`);
    if (fs.existsSync(abs)) return `/media/products/liquidarom/${rangeSlug}/50ml/${c}.webp`;
  }
  return null;
}

async function transferStock(fromId: string, toId: string) {
  const levels = await prisma.stockLevel.findMany({ where: { productId: fromId } });
  let keeperVariant = await prisma.productVariant.findFirst({
    where: { productId: toId },
    orderBy: { createdAt: "asc" },
  });
  if (!keeperVariant && levels.length) {
    const donor = await prisma.productVariant.findFirst({ where: { productId: fromId } });
    keeperVariant = await prisma.productVariant.create({
      data: {
        productId: toId,
        name: donor?.name || "50 ml",
        sku: donor?.sku || null,
        barcode: donor?.barcode || null,
        capacityMl: donor?.capacityMl ?? 50,
        sumupVariantId: donor?.sumupVariantId || null,
      },
    });
  }
  let mergedQty = 0;
  for (const lvl of levels) {
    if (!keeperVariant) break;
    const existing = await prisma.stockLevel.findFirst({
      where: { productId: toId, locationId: lvl.locationId, variantId: keeperVariant.id },
    });
    if (existing) {
      const quantity = existing.quantity + lvl.quantity;
      const reservedQuantity = existing.reservedQuantity + lvl.reservedQuantity;
      await prisma.stockLevel.update({
        where: { id: existing.id },
        data: {
          quantity,
          reservedQuantity,
          availableQuantity: Math.max(0, quantity - reservedQuantity),
        },
      });
      await prisma.stockLevel.delete({ where: { id: lvl.id } });
    } else {
      await prisma.stockLevel.update({
        where: { id: lvl.id },
        data: { productId: toId, variantId: keeperVariant.id },
      });
    }
    mergedQty += lvl.quantity;
  }
  return mergedQty;
}

async function main() {
  const liquidarom = await prisma.manufacturer.findFirst({ where: { slug: "liquidarom" } });
  if (!liquidarom) throw new Error("liquidarom missing");
  const ranges = await prisma.productRange.findMany({
    where: { slug: { in: ["ice-cool", "ice-cool-x"] }, manufacturerId: liquidarom.id },
  });
  const iceCool = ranges.find((r) => r.slug === "ice-cool")!;
  const iceCoolX = ranges.find((r) => r.slug === "ice-cool-x")!;

  const products = await prisma.product.findMany({
    where: {
      manufacturerId: liquidarom.id,
      OR: [
        { rangeId: { in: [iceCool.id, iceCoolX.id] } },
        { range: { in: ["Ice Cool", "Ice Cool X"] } },
        { name: { contains: "Ice Cool", mode: "insensitive" } },
        { productFamily: { in: ["ICE_COOL", "ICE_COOL_X"] } },
      ],
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      stock: true,
      imageUrl: true,
      sumupProductId: true,
      visibleOnline: true,
      productFamily: true,
      range: true,
      rangeId: true,
      stockLevels: { select: { quantity: true } },
    },
  });

  const report: any = {
    mode: APPLY ? "apply" : "dry-run",
    merged: [] as any[],
    keptOfficial: [] as any[],
    removedFromRange: [] as any[],
  };

  // Group by canonical flavor
  const groups = new Map<string, typeof products>();
  for (const p of products) {
    const rangeSlug = isX(p) ? "ice-cool-x" : "ice-cool";
    const flavor = flavorKey(p.name);
    const key = `${rangeSlug}::${flavor}`;
    const list = groups.get(key) || [];
    list.push(p);
    groups.set(key, list);
  }

  for (const [key, list] of groups) {
    const [rangeSlug, flavor] = key.split("::") as ["ice-cool" | "ice-cool-x", string];
    const officialSet = new Set(OFFICIAL[rangeSlug].map((f) => ALIAS[f] || f));
    const isOfficial = officialSet.has(flavor) || OFFICIAL[rangeSlug].includes(flavor);
    const rangeId = rangeSlug === "ice-cool-x" ? iceCoolX.id : iceCool.id;
    const rangeName = rangeSlug === "ice-cool-x" ? "Ice Cool X" : "Ice Cool";
    const photoUrl = photoFor(rangeSlug, flavor);

    const ranked = [...list].sort((a, b) => {
      const sa =
        (a.sumupProductId ? 100 : 0) +
        (a.stockLevels.reduce((s, l) => s + l.quantity, 0) > 0 ? 50 : 0) +
        (a.stock > 0 ? 20 : 0) +
        (a.imageUrl ? 10 : 0) +
        (a.visibleOnline ? 5 : 0);
      const sb =
        (b.sumupProductId ? 100 : 0) +
        (b.stockLevels.reduce((s, l) => s + l.quantity, 0) > 0 ? 50 : 0) +
        (b.stock > 0 ? 20 : 0) +
        (b.imageUrl ? 10 : 0) +
        (b.visibleOnline ? 5 : 0);
      return sb - sa;
    });
    const keeper = ranked[0];
    const losers = ranked.slice(1);

    if (!isOfficial) {
      // Sortir de la gamme (ne pas détruire SumUp)
      for (const p of list) {
        report.removedFromRange.push({ id: p.id, name: p.name, flavor, reason: "hors_phototheque" });
        if (!APPLY) continue;
        await prisma.product.update({
          where: { id: p.id },
          data: {
            rangeId: null,
            visibleOnline: false,
            catalogStatus: "a_verifier",
            importAnomaly: `hors_phototheque_ice_cool:${flavor}`.slice(0, 240),
          },
        });
      }
      continue;
    }

    const cleanName =
      rangeSlug === "ice-cool-x"
        ? `Ice Cool X - ${titleFlavor(flavor)}`
        : `Ice Cool - ${titleFlavor(flavor)}`;
    const stockSum = list.reduce((s, p) => s + p.stock, 0);

    if (losers.length) {
      report.merged.push({
        flavor,
        keeper: keeper.name,
        losers: losers.map((l) => l.name),
        photoUrl,
        stockSum,
      });
    } else {
      report.keptOfficial.push({ flavor, name: keeper.name, photoUrl, stock: keeper.stock });
    }

    if (!APPLY) continue;

    for (const loser of losers) {
      await transferStock(loser.id, keeper.id);
      await prisma.inventoryLine.updateMany({
        where: { productId: loser.id },
        data: { productId: keeper.id },
      });
      await prisma.productImage.deleteMany({ where: { productId: loser.id } });
      await prisma.product.update({
        where: { id: loser.id },
        data: { imageUrl: null, imageStatus: "pending", stock: 0, rangeId: null },
      });
      await quarantineDuplicateProduct(prisma, loser.id, `ice_cool_finalize:${flavor}->${keeper.id}`);
      // hard delete if no sumup
      if (!loser.sumupProductId) {
        await prisma.productVariant.deleteMany({ where: { productId: loser.id } });
        await prisma.stockLevel.deleteMany({ where: { productId: loser.id } });
        await prisma.product.delete({ where: { id: loser.id } }).catch(() => null);
      }
    }

    await prisma.product.update({
      where: { id: keeper.id },
      data: {
        name: cleanName,
        manufacturerId: liquidarom.id,
        rangeId,
        range: rangeName,
        brand: "Liquidarom",
        productFamily: rangeSlug === "ice-cool-x" ? "ICE_COOL_X" : "ICE_COOL",
        stock: stockSum,
        ...(photoUrl ? { imageUrl: photoUrl, imageStatus: "official" } : {}),
        visibleOnline: true,
        isActive: true,
        catalogStatus: "valide",
        importAnomaly: null,
      },
    });
    if (photoUrl) {
      const img = await prisma.productImage.findFirst({
        where: { productId: keeper.id, sortOrder: 0 },
      });
      if (img) {
        await prisma.productImage.update({
          where: { id: img.id },
          data: { url: photoUrl, status: "official" },
        });
      } else {
        await prisma.productImage.create({
          data: {
            productId: keeper.id,
            url: photoUrl,
            status: "official",
            sortOrder: 0,
            alt: cleanName,
          },
        });
      }
    }
  }

  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2), "utf8");
  console.log(
    JSON.stringify(
      {
        mode: report.mode,
        merged: report.merged.length,
        keptOfficial: report.keptOfficial.length,
        removedFromRange: report.removedFromRange.length,
        report: REPORT,
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
