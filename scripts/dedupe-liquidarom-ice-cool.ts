/**
 * Dédoublonne Ice Cool / Ice Cool X (Liquidarom) :
 * - 1 produit par saveur (garde SumUp + stock + photo)
 * - transfère stockLevels / stock agrégé vers le keeper
 * - reclasse inventoryLines vers le keeper
 * - quarantine les doublons (hors gamme visible)
 * - ré-attache photos officielles si présentes sur disque
 *
 * Usage:
 *   npx tsx scripts/dedupe-liquidarom-ice-cool.ts --dry-run
 *   npx tsx scripts/dedupe-liquidarom-ice-cool.ts --apply
 */
import fs from "node:fs";
import path from "node:path";
import "./load-env";
import prisma from "../lib/prisma";
import { quarantineDuplicateProduct } from "../lib/catalog/assert-no-duplicates";

const APPLY = process.argv.includes("--apply");
const REPORT = path.resolve("data/rebuild/DEDUPE_LIQUIDAROM_ICE_COOL.json");
const MEDIA_ROOT = path.resolve("public/media/products/liquidarom");

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

function isX(p: { name: string; productFamily: string | null; slug: string; range: string | null }) {
  return (
    /ice\s*cool\s*x/i.test(p.name) ||
    p.productFamily === "ICE_COOL_X" ||
    /ice-cool-x/i.test(p.slug || "") ||
    /ice\s*cool\s*x/i.test(p.range || "")
  );
}

function flavorKey(name: string) {
  return norm(
    name
      .replace(/liquidarom/gi, " ")
      .replace(/ice\s*cool\s*x?/gi, " ")
      .replace(/\b\d+\s*ml\b/gi, " ")
      .replace(/\b\d+\s*mg\b/gi, " ")
      .replace(/\be-?liquide\b/gi, " "),
  );
}

function titleFlavor(key: string) {
  return key
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function scoreKeeper(p: {
  name: string;
  sumupProductId: string | null;
  stock: number;
  stockQty: number;
  invQty: number;
  imageUrl: string | null;
  visibleOnline: boolean;
  barcode: string | null;
}): number {
  let s = 0;
  if (p.sumupProductId) s += 100;
  if (p.stockQty > 0) s += 50 + Math.min(p.stockQty, 20);
  if (p.stock > 0) s += 20 + Math.min(p.stock, 20);
  if (p.invQty > 0) s += 30 + Math.min(p.invQty, 20);
  if (p.imageUrl) s += 10;
  if (p.visibleOnline) s += 5;
  if (p.barcode) s += 5;
  // Prefer clean short hierarchy name when scores equal-ish
  if (!/^liquidarom\s*-/i.test(p.name)) s += 2;
  return s;
}

function expectedPhotoUrl(rangeSlug: "ice-cool" | "ice-cool-x", flavor: string): string | null {
  const candidates = [flavor, EN_FR[flavor]].filter(Boolean) as string[];
  // also try reverse map
  for (const [en, fr] of Object.entries(EN_FR)) {
    if (fr === flavor || flavor.includes(fr) || fr.includes(flavor)) candidates.push(en);
  }
  for (const c of [...new Set(candidates)]) {
    const rel = path.join(rangeSlug, "50ml", `${c}.webp`);
    const abs = path.join(MEDIA_ROOT, rel);
    if (fs.existsSync(abs)) {
      return `/media/products/liquidarom/${rangeSlug}/50ml/${c}.webp`;
    }
  }
  return null;
}

async function transferStockLevels(fromProductId: string, toProductId: string) {
  const fromLevels = await prisma.stockLevel.findMany({ where: { productId: fromProductId } });
  if (!fromLevels.length) return { moved: 0, mergedQty: 0 };

  // Ensure keeper has a default variant
  let keeperVariant = await prisma.productVariant.findFirst({
    where: { productId: toProductId },
    orderBy: { createdAt: "asc" },
  });
  if (!keeperVariant) {
    const donorVariant = await prisma.productVariant.findFirst({
      where: { productId: fromProductId },
      orderBy: { createdAt: "asc" },
    });
    keeperVariant = await prisma.productVariant.create({
      data: {
        productId: toProductId,
        name: donorVariant?.name || "50 ml",
        sku: donorVariant?.sku || null,
        barcode: donorVariant?.barcode || null,
        capacityMl: donorVariant?.capacityMl ?? 50,
        sumupVariantId: donorVariant?.sumupVariantId || null,
      },
    });
  }

  let moved = 0;
  let mergedQty = 0;
  for (const lvl of fromLevels) {
    const existing = await prisma.stockLevel.findFirst({
      where: { productId: toProductId, locationId: lvl.locationId, variantId: keeperVariant.id },
    });
    if (existing) {
      const quantity = existing.quantity + lvl.quantity;
      const reservedQuantity = existing.reservedQuantity + lvl.reservedQuantity;
      const availableQuantity = Math.max(0, quantity - reservedQuantity);
      await prisma.stockLevel.update({
        where: { id: existing.id },
        data: { quantity, reservedQuantity, availableQuantity },
      });
      await prisma.stockLevel.delete({ where: { id: lvl.id } });
      mergedQty += lvl.quantity;
      moved++;
    } else {
      await prisma.stockLevel.update({
        where: { id: lvl.id },
        data: { productId: toProductId, variantId: keeperVariant.id },
      });
      mergedQty += lvl.quantity;
      moved++;
    }
  }
  return { moved, mergedQty };
}

async function main() {
  const liquidarom = await prisma.manufacturer.findFirst({ where: { slug: "liquidarom" } });
  if (!liquidarom) throw new Error("liquidarom missing");
  const ranges = await prisma.productRange.findMany({
    where: { slug: { in: ["ice-cool", "ice-cool-x"] }, manufacturerId: liquidarom.id },
  });
  const iceCool = ranges.find((r) => r.slug === "ice-cool");
  const iceCoolX = ranges.find((r) => r.slug === "ice-cool-x");
  if (!iceCool || !iceCoolX) throw new Error("ranges missing");

  const products = await prisma.product.findMany({
    where: {
      manufacturerId: liquidarom.id,
      OR: [
        { rangeId: { in: [iceCool.id, iceCoolX.id] } },
        { productFamily: { in: ["ICE_COOL", "ICE_COOL_X"] } },
        { name: { contains: "Ice Cool", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      slug: true,
      imageUrl: true,
      imageStatus: true,
      stock: true,
      visibleOnline: true,
      isActive: true,
      productFamily: true,
      range: true,
      rangeId: true,
      sumupProductId: true,
      barcode: true,
      priceCents: true,
      brand: true,
      stockLevels: { select: { quantity: true, reservedQuantity: true, locationId: true } },
      inventoryLines: { select: { id: true, quantityCounted: true } },
      catalogImages: { select: { id: true, url: true, status: true, sortOrder: true } },
    },
  });

  const inScope = products.filter((p) => {
    if (isX(p)) return true;
    return /ice\s*cool/i.test(p.name) || p.productFamily === "ICE_COOL" || p.rangeId === iceCool.id;
  });

  type P = (typeof inScope)[number] & { stockQty: number; invQty: number; flavor: string; rangeSlug: "ice-cool" | "ice-cool-x" };
  const enriched: P[] = inScope.map((p) => ({
    ...p,
    stockQty: p.stockLevels.reduce((s, l) => s + l.quantity, 0),
    invQty: p.inventoryLines.reduce((s, l) => s + l.quantityCounted, 0),
    flavor: flavorKey(p.name) || "(empty)",
    rangeSlug: isX(p) ? "ice-cool-x" : "ice-cool",
  }));

  const groups = new Map<string, P[]>();
  for (const p of enriched) {
    const key = `${p.rangeSlug}::${p.flavor}`;
    const list = groups.get(key) || [];
    list.push(p);
    groups.set(key, list);
  }

  const report: any = {
    date: new Date().toISOString(),
    mode: APPLY ? "apply" : "dry-run",
    kept: [] as any[],
    quarantined: [] as any[],
    singles: [] as any[],
    stockTransfers: [] as any[],
  };

  console.log(`Mode=${report.mode} products=${enriched.length} groups=${groups.size}`);

  for (const [key, list] of [...groups.entries()].sort()) {
    const [rangeSlug, flavor] = key.split("::") as ["ice-cool" | "ice-cool-x", string];
    const rangeId = rangeSlug === "ice-cool-x" ? iceCoolX.id : iceCool.id;
    const rangeName = rangeSlug === "ice-cool-x" ? "Ice Cool X" : "Ice Cool";
    const ranked = [...list].sort((a, b) => scoreKeeper(b) - scoreKeeper(a));
    const keeper = ranked[0];
    const losers = ranked.slice(1);
    const photoUrl = expectedPhotoUrl(rangeSlug, flavor) || keeper.imageUrl || losers.find((l) => l.imageUrl)?.imageUrl || null;

    const cleanName =
      rangeSlug === "ice-cool-x"
        ? `Ice Cool X - ${titleFlavor(flavor)}`
        : `Ice Cool - ${titleFlavor(flavor)}`;

    const totalStock =
      list.reduce((s, p) => s + p.stock, 0);
    const totalLevels = list.reduce((s, p) => s + p.stockQty, 0);
    const totalInv = list.reduce((s, p) => s + p.invQty, 0);

    if (losers.length === 0) {
      report.singles.push({
        flavor,
        rangeSlug,
        id: keeper.id,
        name: keeper.name,
        stock: keeper.stock,
        stockQty: keeper.stockQty,
        invQty: keeper.invQty,
        photoUrl,
      });
      if (APPLY) {
        await prisma.product.update({
          where: { id: keeper.id },
          data: {
            manufacturerId: liquidarom.id,
            rangeId,
            range: rangeName,
            brand: "Liquidarom",
            productFamily: rangeSlug === "ice-cool-x" ? "ICE_COOL_X" : "ICE_COOL",
            name: /^liquidarom\s*-/i.test(keeper.name) ? cleanName : keeper.name,
            ...(photoUrl
              ? { imageUrl: photoUrl, imageStatus: "official" }
              : {}),
            visibleOnline: true,
            isActive: true,
            catalogStatus: "valide",
            // stock field: keep existing unless we need to sum from nowhere
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
      continue;
    }

    // Dedup group
    report.kept.push({
      flavor,
      rangeSlug,
      keeper: {
        id: keeper.id,
        name: keeper.name,
        cleanName,
        score: scoreKeeper(keeper),
        stock: keeper.stock,
        stockQty: keeper.stockQty,
        invQty: keeper.invQty,
        sumup: !!keeper.sumupProductId,
      },
      losers: losers.map((l) => ({
        id: l.id,
        name: l.name,
        stock: l.stock,
        stockQty: l.stockQty,
        invQty: l.invQty,
        sumup: !!l.sumupProductId,
      })),
      totals: { stock: totalStock, stockQty: totalLevels, invQty: totalInv },
      photoUrl,
    });

    if (!APPLY) {
      for (const l of losers) {
        report.quarantined.push({ id: l.id, name: l.name, into: keeper.id });
      }
      continue;
    }

    // Transfer stock levels + aggregate stock field
    for (const loser of losers) {
      const transfer = await transferStockLevels(loser.id, keeper.id);
      report.stockTransfers.push({
        from: loser.id,
        to: keeper.id,
        ...transfer,
        productStockFrom: loser.stock,
      });

      // Re-point inventory lines
      await prisma.inventoryLine.updateMany({
        where: { productId: loser.id },
        data: { productId: keeper.id },
      });

      // Clear loser images then quarantine (leave stock field 0 after transfer of levels)
      await prisma.productImage.deleteMany({ where: { productId: loser.id } });
      await prisma.product.update({
        where: { id: loser.id },
        data: {
          imageUrl: null,
          imageStatus: "pending",
          stock: 0,
          rangeId: null,
          // keep manufacturer for audit trail
        },
      });
      await quarantineDuplicateProduct(
        prisma,
        loser.id,
        `ice_cool_dedupe:${flavor}->${keeper.id}`,
      );
      report.quarantined.push({ id: loser.id, name: loser.name, into: keeper.id });
    }

    const stockSum = totalStock; // preserve sum of legacy stock fields
    await prisma.product.update({
      where: { id: keeper.id },
      data: {
        manufacturerId: liquidarom.id,
        rangeId,
        range: rangeName,
        brand: "Liquidarom",
        productFamily: rangeSlug === "ice-cool-x" ? "ICE_COOL_X" : "ICE_COOL",
        name: cleanName,
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
        keptGroups: report.kept.length,
        quarantined: report.quarantined.length,
        singles: report.singles.length,
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
