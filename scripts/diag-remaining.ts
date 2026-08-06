import { PrismaClient } from "@prisma/client";
import fs from "node:fs";

const prisma = new PrismaClient();

async function main() {
  const targets = [
    "Leox 60 ml",
    "Pure Passion 60 ml",
    "Frost 50 ml",
    "Force Verte",
    "Force Violette",
    "Custard Vanille 60 ml",
    "Bisou Black 50 ml",
    "Senka",
    "Yuluma",
    "Candy Gold Edition 50 ml",
    "Milo 50 ml",
    "Pyro 50 ml",
    "Xena 50 ml",
  ];

  const out: any[] = [];
  for (const name of targets) {
    const exact = await prisma.product.findMany({
      where: { name: { equals: name, mode: "insensitive" } },
      select: {
        id: true,
        name: true,
        isActive: true,
        barcode: true,
        sumupProductId: true,
        imageUrl: true,
        volumeMl: true,
        manufacturer: { select: { name: true } },
        rangeRef: { select: { name: true } },
      },
    });
    const fuzzy = await prisma.product.findMany({
      where: {
        name: { contains: name.split(" ")[0], mode: "insensitive" },
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        barcode: true,
        sumupProductId: true,
        imageUrl: true,
        volumeMl: true,
      },
      take: 10,
    });
    out.push({ name, exact, fuzzyRelated: fuzzy });
  }

  // SumUp image URLs for products missing photo but having sumup
  const missPhoto = ["Leox 60 ml", "Pure Passion 60 ml"];
  for (const name of missPhoto) {
    const p = await prisma.product.findFirst({
      where: { name, isActive: true },
    });
    out.push({
      check: name,
      sumup: p?.sumupProductId,
      barcode: p?.barcode,
      imageUrl: p?.imageUrl,
    });
  }

  fs.writeFileSync(
    "catalogues/final-100/rapports/DIAG_REMAINING.json",
    JSON.stringify(out, null, 2),
  );
  console.log(JSON.stringify(out, null, 2));
  await prisma.$disconnect();
}

main();
