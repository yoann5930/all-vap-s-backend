import prisma from "../lib/prisma";

const keys = [
  ["swoke", "saint-flava-swoke"],
  ["swoke", "bisou-swoke"],
  ["swoke", "force-vape-swoke"],
  ["airmust", "unik-airmust"],
  ["juice-66", "66-juice-juice-66"],
  ["aromes-secrets", "mythologie-aromes-secrets"],
  ["cloud-vapor", "grand-taste-city-cloud-vapor"],
  ["avap", "devil-avap"],
] as const;

async function main() {
  for (const [ms, rs] of keys) {
    const r = await prisma.productRange.findFirst({
      where: { slug: rs, manufacturer: { slug: ms } },
      include: {
        manufacturer: true,
        products: {
          where: {
            OR: [{ imageUrl: { not: null } }, { visibleOnline: true }],
          },
          select: { name: true, imageUrl: true, visibleOnline: true },
          take: 6,
        },
      },
    });
    if (!r) {
      console.log(`${ms}/${rs}: RANGE NOT FOUND`);
      continue;
    }
    console.log(
      JSON.stringify({
        key: `${ms}/${rs}`,
        name: r.name,
        verificationStatus: r.verificationStatus,
        catalogVisible: r.catalogVisible,
        status: r.status,
        isActive: r.isActive,
        website: r.manufacturer?.website,
        images: r.products.map((x) => ({
          name: x.name,
          imageUrl: x.imageUrl,
        })),
      })
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
