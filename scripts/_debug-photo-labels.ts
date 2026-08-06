import "./load-env";
import prisma from "../lib/prisma";
import { normalizeCatalogKey } from "../lib/catalog/assert-no-duplicates";

async function main() {
  const url = "https://www.liquidarom.com/360-e-liquide-les-collegues";
  const res = await fetch(url, {
    headers: { "User-Agent": "AllVapsCatalogBot/1.0" },
    signal: AbortSignal.timeout(25000),
  });
  const html = (await res.text()).replace(/\\\//g, "/");
  const labels = [
    ...html.matchAll(
      /\/\d+-(?:home_default_2x|home_default)\/([a-z0-9-]+)\.(?:jpe?g|png|webp)/gi,
    ),
  ].map((m) => m[1]);
  console.log("labels", [...new Set(labels)]);

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      visibleOnline: false,
      sumupProductId: { not: null },
      OR: [
        { name: { contains: "Coquette", mode: "insensitive" } },
        { name: { contains: "Mimi", mode: "insensitive" } },
        { name: { contains: "Balèze", mode: "insensitive" } },
        { name: { contains: "Charmeur", mode: "insensitive" } },
        { name: { contains: "Numbers", mode: "insensitive" } },
        { name: { contains: "Akashi", mode: "insensitive" } },
        { name: { contains: "Grok", mode: "insensitive" } },
      ],
    },
    select: { name: true, slug: true, manufacturer: { select: { slug: true } } },
  });
  console.log(
    "products",
    products.map((p) => ({
      name: p.name,
      slug: p.slug,
      mfr: p.manufacturer?.slug,
      norm: normalizeCatalogKey(p.name),
    })),
  );
  await prisma.$disconnect();
}
main();
