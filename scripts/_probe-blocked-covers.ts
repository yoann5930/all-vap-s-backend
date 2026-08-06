import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma";

const NEED = ["juice-66", "aromes-secrets", "cloud-vapor", "avap"] as const;

async function main() {
  for (const slug of NEED) {
    const m = await prisma.manufacturer.findFirst({ where: { slug } });
    console.log("\n===", slug, "===");
    if (!m) {
      console.log("manufacturer missing");
      continue;
    }
    console.log({
      name: m.name,
      website: m.website,
      logoUrl: m.logoUrl,
      isActive: m.isActive,
    });

    const products = await prisma.product.findMany({
      where: { manufacturerId: m.id },
      select: {
        name: true,
        imageUrl: true,
        sumupProductId: true,
        visibleOnline: true,
        isActive: true,
        range: { select: { slug: true, name: true } },
      },
      take: 20,
    });
    console.log("products", products.length);
    for (const p of products.slice(0, 10)) {
      console.log({
        name: p.name,
        range: p.range?.slug,
        imageUrl: p.imageUrl,
        sumup: p.sumupProductId,
        visible: p.visibleOnline,
      });
    }

    // Stock / sumup catalog raw if present
    const sumup = await prisma.sumUpProduct
      ?.findMany?.({
        where: {
          OR: [
            { name: { contains: m.name, mode: "insensitive" } },
            { name: { contains: slug.replace(/-/g, " "), mode: "insensitive" } },
          ],
        },
        take: 5,
      })
      .catch(() => null);
  }

  // Local file hunt (narrow)
  const roots = [
    path.join(process.cwd(), "public", "media"),
    path.join(process.cwd(), "catalogues"),
    path.join(process.cwd(), "data"),
    path.join(process.cwd(), "exports"),
  ];
  const needles = [
    "juice-66",
    "juice66",
    "aromes",
    "mythologie",
    "cloud-vapor",
    "cloudvapor",
    "avap",
    "devil",
  ];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const walk = (dir: string, depth = 0) => {
      if (depth > 4) return;
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        const low = e.name.toLowerCase();
        if (needles.some((n) => low.includes(n))) {
          console.log("LOCAL_HIT", full);
        }
        if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules") {
          walk(full, depth + 1);
        }
      }
    };
    walk(root);
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
