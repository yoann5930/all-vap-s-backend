import "./load-env";
import prisma from "../lib/prisma";
import { manufacturerLogoUrl } from "../lib/catalog/manufacturer-logo";

async function main() {
  console.log("logo", manufacturerLogoUrl("liquide-lab"));
  const visible = await prisma.product.count({
    where: { manufacturer: { slug: "liquide-lab" }, visibleOnline: true },
  });
  const by = await prisma.product.groupBy({
    by: ["range"],
    where: { manufacturer: { slug: "liquide-lab" }, visibleOnline: true },
    _count: true,
  });
  const ranges = await prisma.productRange.findMany({
    where: { manufacturer: { slug: "liquide-lab" }, isActive: true },
    select: { slug: true, name: true },
  });
  console.log(JSON.stringify({ visible, by, ranges }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
