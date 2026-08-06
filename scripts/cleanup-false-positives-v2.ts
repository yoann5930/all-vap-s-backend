/**
 * Nettoie les faux positifs restants :
 * - Les Collègues Mimi/Coquette/Balèze/Charmeur = photo "Le Tchatcheur"
 * - Kyoto Storm = logo Raneki (pas un packshot produit)
 * - Liens DB vers fichiers manquants
 * - Raws mauvais format (Pastis 10ml, P'tit Blond 200ml)
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma";

const MEDIA_ROOT = path.resolve("public/media/products");

function unlinkQuiet(p: string) {
  if (p && fs.existsSync(p)) fs.unlinkSync(p);
}

async function clearProduct(productId: string, name: string, imageUrl: string | null, reason: string) {
  if (imageUrl?.startsWith("/media/")) {
    const abs = path.resolve("public", imageUrl.replace(/^\//, ""));
    unlinkQuiet(abs);
    unlinkQuiet(abs.replace(/\.webp$/i, "-thumb.webp"));
  }
  await prisma.productImage.deleteMany({ where: { productId } });
  await prisma.product.update({
    where: { id: productId },
    data: {
      imageUrl: null,
      imageStatus: "pending",
      images: { set: [] },
      visibleOnline: false,
      importAnomaly: reason,
    },
  });
  console.log(`CLEAN ${name} ← ${reason}`);
}

async function main() {
  const products = await prisma.product.findMany({
    where: { catalogStatus: "valide" },
    select: {
      id: true,
      name: true,
      imageUrl: true,
      imageStatus: true,
      productFamily: true,
    },
  });

  for (const p of products) {
    const n = p.name.toLowerCase();
    const family = p.productFamily || "";

    // Collègues : 4 références faussement liées à Le Tchatcheur
    if (
      family === "LES_COLLEGUES" &&
      /(mimi|coquette|bal[eè]ze|charmeur)/i.test(n)
    ) {
      await clearProduct(p.id, p.name, p.imageUrl, "faux_positif_photo_tchatcheur");
      continue;
    }

    // Kyoto Storm : logo fabricant, pas packshot
    if (family === "KYOTO_STORM") {
      await clearProduct(p.id, p.name, p.imageUrl, "faux_positif_logo_fabricant");
      continue;
    }

    // Lien cassé
    if (p.imageUrl?.startsWith("/media/")) {
      const abs = path.resolve("public", p.imageUrl.replace(/^\//, ""));
      if (!fs.existsSync(abs)) {
        await clearProduct(p.id, p.name, p.imageUrl, "media_fichier_manquant");
      }
    }
  }

  // Supprimer raws erronés
  const badRaws = [
    path.join(MEDIA_ROOT, "_raw/liquidarom/les-collegues/la-coquette.jpg"),
    path.join(MEDIA_ROOT, "_raw/liquidarom/les-collegues/la-mimi.jpg"),
    path.join(MEDIA_ROOT, "_raw/liquidarom/les-collegues/la-baleze.jpg"),
    path.join(MEDIA_ROOT, "_raw/liquidarom/les-collegues/le-charmeur.jpg"),
    path.join(MEDIA_ROOT, "_raw/liquidarom/les-essentiels/pastis-13.jpg"),
    path.join(MEDIA_ROOT, "_raw/liquidarom/les-essentiels/le-p-tit-blond.jpg"),
    ...["akashi", "hanzo", "maneki", "musashi", "ryujin", "zenko"].map((s) =>
      path.join(MEDIA_ROOT, `_raw/raneki-liquide/kyoto-storm/${s}.jpg`)
    ),
  ];
  for (const f of badRaws) unlinkQuiet(f);

  // Alignement rapport
  const reportPath = path.resolve("data/phototheque/RAPPORT_PHOTOTHEQUE.json");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  for (const row of report.produits || []) {
    if (
      row.family === "KYOTO_STORM" ||
      (row.family === "LES_COLLEGUES" &&
        /(mimi|coquette|bal[eè]ze|charmeur)/i.test(row.name))
    ) {
      row.photoOfficielleTrouvee = "non";
      row.source = null;
      row.sourceType = "aucune";
      row.imageAmelioree = "non";
      row.mediaPath = null;
      row.publicUrl = null;
      row.imageManquante = true;
      row.anomalies = [
        row.family === "KYOTO_STORM"
          ? "faux_positif_logo_fabricant_retire"
          : "faux_positif_photo_autre_produit_retire",
      ];
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

  const official = await prisma.product.count({
    where: { catalogStatus: "valide", imageStatus: "official" },
  });
  console.log(
    JSON.stringify(
      {
        reportFound: report.photosTrouvees,
        reportMissing: report.photosManquantes,
        dbOfficial: official,
        couverturePct: report.couverturePct,
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
