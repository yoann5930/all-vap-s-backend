/**
 * Retire les photos liées dont le fichier local n'existe plus.
 * Ne publie jamais une fiche sans fichier image réel.
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma";

async function main() {
  const products = await prisma.product.findMany({
    where: { catalogStatus: "valide" },
    include: { catalogImages: true },
  });

  let cleared = 0;
  for (const p of products) {
    const urls = [
      p.imageUrl,
      ...p.catalogImages.map((i) => i.url),
      ...(p.images || []),
    ].filter(Boolean) as string[];

    const missingFiles = urls.filter((u) => {
      if (!u.startsWith("/media/") && !u.startsWith("/images/")) return false;
      const abs = path.join(process.cwd(), "public", u.replace(/^\//, ""));
      return !fs.existsSync(abs);
    });

    const hasValidLocal = urls.some((u) => {
      if (!u.startsWith("/media/") && !u.startsWith("/images/")) return false;
      return fs.existsSync(path.join(process.cwd(), "public", u.replace(/^\//, "")));
    });

    if (missingFiles.length && !hasValidLocal) {
      await prisma.productImage.deleteMany({ where: { productId: p.id } });
      await prisma.product.update({
        where: { id: p.id },
        data: {
          imageUrl: null,
          images: { set: [] },
          imageStatus: "pending",
          visibleOnline: false,
          importAnomaly: "photo_fichier_absent",
        },
      });
      cleared++;
      console.log(`cleared broken photo: ${p.name}`);
    } else if (missingFiles.length && hasValidLocal) {
      // garder l'URL valide
      const good = urls.find((u) =>
        fs.existsSync(path.join(process.cwd(), "public", u.replace(/^\//, "")))
      );
      if (good && good !== p.imageUrl) {
        await prisma.product.update({
          where: { id: p.id },
          data: { imageUrl: good, imageStatus: "official", visibleOnline: true },
        });
      }
    }
  }

  const visible = await prisma.product.count({
    where: { catalogStatus: "valide", isActive: true, visibleOnline: true },
  });
  console.log(JSON.stringify({ cleared, visible }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
