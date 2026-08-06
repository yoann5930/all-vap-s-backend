import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma";

async function main() {
  const m = await prisma.manufacturer.findFirst({ where: { slug: "juice-66" } });
  if (!m) {
    console.log("no manufacturer");
    return;
  }
  console.log({ id: m.id, name: m.name, website: m.website });

  const products = await prisma.product.findMany({
    where: { manufacturerId: m.id },
    select: {
      id: true,
      name: true,
      slug: true,
      imageUrl: true,
      sumupProductId: true,
      visibleOnline: true,
      isActive: true,
      range: { select: { slug: true, name: true } },
    },
  });
  console.log("products total", products.length);
  console.log(
    JSON.stringify(
      products.slice(0, 30).map((p) => ({
        name: p.name,
        range: p.range?.slug,
        imageUrl: p.imageUrl,
        sumup: p.sumupProductId,
        visible: p.visibleOnline,
        active: p.isActive,
      })),
      null,
      2
    )
  );

  // CSV hunt
  const roots = [
    path.join(process.cwd(), "catalogues"),
    path.join(process.cwd(), "data"),
  ];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const files = fs.readdirSync(root);
    for (const f of files) {
      if (!/\.(csv|json|tsv)$/i.test(f)) continue;
      const full = path.join(root, f);
      const text = fs.readFileSync(full, "utf8");
      if (/juice\s*66|juice-66|juice66/i.test(text)) {
        const lines = text.split(/\r?\n/).filter((l) => /juice\s*66|juice-66|juice66/i.test(l));
        console.log("HIT", full, "lines", lines.length);
        console.log(lines.slice(0, 5).join("\n").slice(0, 800));
      }
    }
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
