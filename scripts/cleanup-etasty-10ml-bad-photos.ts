/**
 * Nettoie les photos 10 ml douteuses sur produits non publiés
 * (Barbe à papa : site officiel mappe vers image Poire — ne pas publier / ne pas garder).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.product.findMany({
    where: {
      brand: "e.Tasty",
      productType: "10ml",
      visibleOnline: false,
      catalogStatus: "a_verifier",
      OR: [
        { name: { contains: "Barbe", mode: "insensitive" } },
        { name: { contains: "Harrison", mode: "insensitive" } },
      ],
    },
    include: { catalogImages: true },
  });

  for (const p of rows) {
    await prisma.productImage.deleteMany({ where: { productId: p.id } });
    await prisma.product.update({
      where: { id: p.id },
      data: {
        imageUrl: null,
        imageStatus: "pending",
        importAnomaly:
          /barbe/i.test(p.name)
            ? "photo_officielle_10ml_indisponible_mapping_site_errone"
            : "saveur_absente_catalogue_officiel_10ml",
      },
    });
  }
  console.log(JSON.stringify({ cleaned: rows.map((r) => r.name) }, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
