/**
 * Audit Ice Cool — candidats publication (sans publier).
 * Critères : photo official, format, fabricant/gamme, prix, SumUp.
 */
import prisma from "../lib/prisma";

async function main() {
  const products = await prisma.product.findMany({
    where: {
      catalogStatus: "valide",
      OR: [
        { range: { equals: "Ice Cool", mode: "insensitive" } },
        { productFamily: "ICE_COOL" },
        { name: { startsWith: "Ice Cool -", mode: "insensitive" } },
      ],
    },
    include: {
      catalogImages: true,
      manufacturer: true,
      rangeRef: true,
      variants: true,
    },
    orderBy: { name: "asc" },
  });

  const rows = products.map((p) => {
    const officialImg =
      p.imageStatus === "official" &&
      !!p.imageUrl &&
      p.imageUrl.startsWith("/media/");
    const formatOk = !!p.productType && /^\d+ml$/i.test(p.productType);
    const priceOk = typeof p.priceCents === "number" && p.priceCents > 0;
    const sumupOk = !!p.sumupProductId;
    const mfrOk = !!p.manufacturerId || /liquidarom/i.test(p.brand || "");
    const rangeOk =
      /ice\s*cool$/i.test(p.range || "") || p.productFamily === "ICE_COOL";
    // Exclure Ice Cool X
    const isX =
      /ice\s*cool\s*x/i.test(p.name) ||
      /ice\s*cool\s*x/i.test(p.range || "") ||
      p.productFamily === "ICE_COOL_X";

    const blockers: string[] = [];
    if (isX) blockers.push("ice_cool_x_exclure");
    if (!officialImg) blockers.push("photo");
    if (!formatOk) blockers.push("format");
    if (!priceOk) blockers.push("prix");
    if (!sumupOk) blockers.push("sumup");
    if (!mfrOk) blockers.push("fabricant");
    if (!rangeOk) blockers.push("gamme");

    return {
      id: p.id,
      name: p.name,
      brand: p.brand,
      range: p.range,
      format: p.productType,
      priceCents: p.priceCents,
      stock: p.stock,
      sumupProductId: p.sumupProductId,
      sumupVariantId: p.sumupVariantId,
      imageUrl: p.imageUrl,
      imageStatus: p.imageStatus,
      visibleOnline: p.visibleOnline,
      isX,
      ready: blockers.length === 0,
      blockers,
    };
  });

  const iceCool = rows.filter((r) => !r.isX);
  const ready = iceCool.filter((r) => r.ready);
  const blocked = iceCool.filter((r) => !r.ready);

  console.log(
    JSON.stringify(
      {
        totalIceCool: iceCool.length,
        ready: ready.length,
        blocked: blocked.length,
        readyNames: ready.map((r) => r.name),
        blockedDetail: blocked.map((r) => ({
          name: r.name,
          blockers: r.blockers,
          format: r.format,
          priceCents: r.priceCents,
          imageStatus: r.imageStatus,
          imageUrl: r.imageUrl,
          sumup: !!r.sumupProductId,
        })),
      },
      null,
      2
    )
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
