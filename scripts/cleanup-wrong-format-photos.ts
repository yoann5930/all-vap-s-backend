/**
 * Retire les photos au mauvais format (Pastis 13 → 10ml, P'tit Blond → 200ml).
 * Règle : une photo doit correspondre exactement au produit (format inclus).
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma";

async function main() {
  const targets = await prisma.product.findMany({
    where: {
      catalogStatus: "valide",
      OR: [
        { name: { contains: "Pastis", mode: "insensitive" } },
        { name: { contains: "P'tit Blond", mode: "insensitive" } },
        { name: { contains: "Ptit Blond", mode: "insensitive" } },
      ],
    },
  });

  for (const p of targets) {
    console.log(`CLEAN ${p.name} | was ${p.imageUrl}`);
    if (p.imageUrl?.startsWith("/media/")) {
      const abs = path.resolve("public", p.imageUrl.replace(/^\//, ""));
      const thumb = abs.replace(/\.webp$/i, "-thumb.webp");
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
      if (fs.existsSync(thumb)) fs.unlinkSync(thumb);
    }
    await prisma.productImage.deleteMany({ where: { productId: p.id } });
    await prisma.product.update({
      where: { id: p.id },
      data: {
        imageUrl: null,
        imageStatus: "pending",
        images: { set: [] },
        visibleOnline: false,
        importAnomaly: "photo_mauvais_format_retiree",
      },
    });
  }

  // Mettre à jour le rapport JSON
  const reportPath = path.resolve("data/phototheque/RAPPORT_PHOTOTHEQUE.json");
  if (fs.existsSync(reportPath)) {
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    for (const row of report.produits || []) {
      if (/pastis|p.?tit blond/i.test(row.name)) {
        row.photoOfficielleTrouvee = "non";
        row.source = null;
        row.sourceType = "aucune";
        row.imageAmelioree = "non";
        row.mediaPath = null;
        row.publicUrl = null;
        row.imageManquante = true;
        row.anomalies = ["photo_mauvais_format_retiree_attendu_50ml"];
      }
    }
    report.photosTrouvees = (report.produits || []).filter(
      (p: { photoOfficielleTrouvee: string }) => p.photoOfficielleTrouvee === "oui"
    ).length;
    report.photosManquantes = (report.produits || []).length - report.photosTrouvees;
    report.photosAmeliorees = report.photosTrouvees;
    report.couverturePct =
      Math.round((report.photosTrouvees / Math.max(report.totalValides || 91, 1)) * 1000) / 10;
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  }

  console.log(`Nettoyé ${targets.length} fiche(s) au mauvais format.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
