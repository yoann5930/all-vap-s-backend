/**
 * Réconcilie DB imageStatus=official vs rapport photothèque.
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma";

async function main() {
  const report = JSON.parse(
    fs.readFileSync(path.resolve("data/phototheque/RAPPORT_PHOTOTHEQUE.json"), "utf8")
  );
  const products = await prisma.product.findMany({
    where: { catalogStatus: "valide" },
    select: {
      id: true,
      name: true,
      imageUrl: true,
      imageStatus: true,
      productFamily: true,
      brand: true,
      productType: true,
    },
    orderBy: { name: "asc" },
  });

  const byId = new Map((report.produits || []).map((r: { productId: string }) => [r.productId, r]));
  const dbOfficial = products.filter((p) => p.imageStatus === "official" && p.imageUrl);
  const reportFound = (report.produits || []).filter(
    (r: { photoOfficielleTrouvee: string }) => r.photoOfficielleTrouvee === "oui"
  );

  const inDbNotReport = dbOfficial.filter((p) => {
    const r = byId.get(p.id) as { photoOfficielleTrouvee?: string } | undefined;
    return !r || r.photoOfficielleTrouvee !== "oui";
  });
  const inReportNotDb = reportFound.filter((r: { productId: string }) => {
    const p = products.find((x) => x.id === r.productId);
    return !p || p.imageStatus !== "official" || !p.imageUrl;
  });

  console.log(
    JSON.stringify(
      {
        dbOfficial: dbOfficial.length,
        reportFound: reportFound.length,
        inDbNotReport: inDbNotReport.map((p) => ({ name: p.name, imageUrl: p.imageUrl, family: p.productFamily })),
        inReportNotDb: inReportNotDb.map((r: { name: string }) => r.name),
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
