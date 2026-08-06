/**
 * Publie UNIQUEMENT la gamme Ice Cool (Liquidarom) si critères complets.
 * N'affiche rien sur l'accueil — visibleOnline seulement.
 * N'inclut PAS Ice Cool X.
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma";

async function main() {
  const products = await prisma.product.findMany({
    where: {
      catalogStatus: "valide",
      productFamily: "ICE_COOL",
      NOT: {
        OR: [
          { productFamily: "ICE_COOL_X" },
          { name: { contains: "Ice Cool X", mode: "insensitive" } },
          { range: { contains: "Ice Cool X", mode: "insensitive" } },
        ],
      },
    },
    orderBy: { name: "asc" },
  });

  const published: string[] = [];
  const skipped: Array<{ name: string; reason: string }> = [];

  for (const p of products) {
    if (/ice\s*cool\s*x/i.test(p.name) || /ice\s*cool\s*x/i.test(p.range || "")) {
      skipped.push({ name: p.name, reason: "ice_cool_x" });
      continue;
    }
    if (p.imageStatus !== "official" || !p.imageUrl?.startsWith("/media/")) {
      skipped.push({ name: p.name, reason: "photo" });
      continue;
    }
    const abs = path.resolve("public", p.imageUrl.replace(/^\//, ""));
    if (!fs.existsSync(abs)) {
      skipped.push({ name: p.name, reason: "fichier_image_absent" });
      continue;
    }
    if (!p.productType || !/^\d+ml$/i.test(p.productType)) {
      skipped.push({ name: p.name, reason: "format" });
      continue;
    }
    if (!p.priceCents || p.priceCents <= 0) {
      skipped.push({ name: p.name, reason: "prix" });
      continue;
    }
    if (!p.sumupProductId) {
      skipped.push({ name: p.name, reason: "sumup" });
      continue;
    }

    // Lier à la gamme Ice Cool du référentiel
    const iceRange = await prisma.productRange.findFirst({
      where: { slug: "ice-cool" },
    });
    const liquidarom = await prisma.manufacturer.findFirst({
      where: { slug: "liquidarom" },
    });

    await prisma.product.update({
      where: { id: p.id },
      data: {
        visibleOnline: true,
        isActive: true,
        isPromo: false,
        isNew: false,
        isBestSeller: false,
        brand: "Liquidarom",
        range: "Ice Cool",
        productFamily: "ICE_COOL",
        productType: p.productType,
        importAnomaly: null,
        ...(iceRange ? { rangeId: iceRange.id } : {}),
        ...(liquidarom ? { manufacturerId: liquidarom.id } : {}),
      },
    });
    published.push(p.name);
  }

  const report = {
    date: new Date().toISOString(),
    gamme: "Ice Cool",
    fabricant: "Liquidarom",
    publishedCount: published.length,
    published,
    skipped,
    controlUrl: "http://localhost:3000/gammes/ice-cool",
    homeUntouched: true,
  };

  fs.mkdirSync(path.resolve("data/rebuild"), { recursive: true });
  fs.writeFileSync(
    path.resolve("data/rebuild/PUBLISH_ICE_COOL.json"),
    JSON.stringify(report, null, 2),
    "utf8"
  );
  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
