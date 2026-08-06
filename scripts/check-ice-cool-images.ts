import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma";

async function main() {
  const products = await prisma.product.findMany({
    where: { productFamily: "ICE_COOL", visibleOnline: true },
    select: { name: true, imageUrl: true, imageStatus: true },
    take: 5,
  });
  for (const p of products) {
    const abs = p.imageUrl
      ? path.resolve("public", p.imageUrl.replace(/^\//, ""))
      : null;
    console.log({
      name: p.name,
      imageUrl: p.imageUrl,
      imageStatus: p.imageStatus,
      exists: abs ? fs.existsSync(abs) : false,
      abs,
    });
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
