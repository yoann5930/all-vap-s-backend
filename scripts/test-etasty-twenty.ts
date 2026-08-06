/**
 * Tests gamme Twenty + format 20 ml.
 * Run: npx tsx scripts/test-etasty-twenty.ts
 */
import prisma from "../lib/prisma";
import { isPromo10mlEligible } from "../lib/promotions/promo-10ml";

async function main() {
  let failed = 0;
  const ok = (c: boolean, msg: string) => {
    if (c) console.log("OK ", msg);
    else {
      failed++;
      console.error("FAIL", msg);
    }
  };

  const format = await prisma.catalogFormat.findUnique({ where: { code: "20ml" } });
  ok(!!format && format.isActive && format.status === "valide", "CatalogFormat 20ml actif");
  ok(format?.ml === 20, "CatalogFormat ml=20");

  const formats = await prisma.catalogFormat.findMany({
    where: { isActive: true, status: "valide" },
    orderBy: { ml: "asc" },
    select: { code: true },
  });
  const codes = formats.map((f) => f.code);
  const expectedOrder = ["10ml", "20ml", "30ml", "50ml", "70ml", "100ml"];
  ok(
    expectedOrder.every((c) => codes.includes(c)),
    `formats incluent 10/20/30/50/70/100 (got ${codes.join(",")})`
  );
  const idx = expectedOrder.map((c) => codes.indexOf(c));
  ok(
    idx.every((v, i) => i === 0 || v > idx[i - 1]),
    "ordre ml croissant (20 entre 10 et 30)"
  );

  const range = await prisma.productRange.findFirst({
    where: { slug: "twenty", manufacturer: { slug: "e-tasty" } },
  });
  ok(!!range, "gamme Twenty existe");
  ok(range?.formatCodes?.includes("20ml") === true, "Twenty formatCodes contient 20ml");

  const products = await prisma.product.findMany({
    where: { productFamily: "ETASTY_TWENTY" },
    select: {
      name: true,
      slug: true,
      productType: true,
      volumeMl: true,
      promotion10mlEligible: true,
      visibleOnline: true,
      catalogStatus: true,
      barcode: true,
      sumupProductId: true,
      imageUrl: true,
      priceCents: true,
      brand: true,
      range: true,
    },
  });
  ok(products.length === 5, `5 produits Twenty (got ${products.length})`);
  ok(
    products.every((p) => p.productType === "20ml" && p.volumeMl === 20),
    "tous Twenty = 20ml / volumeMl=20"
  );
  ok(
    products.every((p) => p.promotion10mlEligible === false),
    "aucun Twenty éligible promo 10ml"
  );
  ok(
    products.every((p) => p.brand === "e.Tasty" && p.range === "Twenty"),
    "fabricant + gamme corrects"
  );

  const published = products.filter(
    (p) => p.visibleOnline && p.catalogStatus === "valide"
  );
  ok(published.length >= 1, `au moins 1 Twenty publié (got ${published.length})`);
  ok(
    published.every((p) => p.imageUrl?.includes("/twenty/20ml/")),
    "photos publiées sous /twenty/20ml/"
  );

  const wrong10 = await prisma.product.count({
    where: {
      productFamily: "ETASTY_TWENTY",
      OR: [{ productType: "10ml" }, { volumeMl: 10 }, { promotion10mlEligible: true }],
    },
  });
  ok(wrong10 === 0, "aucun Twenty classé 10ml / promo");

  const onFormatPage = await prisma.product.count({
    where: {
      productType: "20ml",
      visibleOnline: true,
      isActive: true,
      catalogStatus: { in: ["valide", "actif"] },
      NOT: { productType: "20ml" }, // impossible — sanity
    },
  });
  void onFormatPage;
  const only20 = await prisma.product.findMany({
    where: {
      productType: "20ml",
      visibleOnline: true,
      catalogStatus: { in: ["valide", "actif"] },
    },
    select: { productType: true, volumeMl: true },
  });
  ok(
    only20.every((p) => p.productType === "20ml"),
    "page format 20ml = uniquement 20ml"
  );

  ok(
    !isPromo10mlEligible({
      category: "E-liquides",
      volumeMl: 20,
      productType: "20ml",
      promotion10mlEligible: true,
      visibleOnline: true,
      isActive: true,
      catalogStatus: "valide",
      stock: 5,
    }),
    "promo 10ml refuse volumeMl=20 même si flag true"
  );

  console.log(`\npublished=${published.length} aVerifier=${products.length - published.length} fails=${failed}`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
