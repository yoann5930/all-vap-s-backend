/**
 * Aligne Ice Cool / Ice Cool X sur le naming Fabricant — Gamme — Produit.
 * Ne touche pas stock / photos.
 */
import "./load-env";
import prisma from "../lib/prisma";

const APPLY = process.argv.includes("--apply");

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function titleFromName(name: string, range: string) {
  let s = name
    .replace(/liquidarom/gi, " ")
    .replace(/ice\s*cool\s*x?/gi, " ")
    .replace(/\b\d+\s*ml\b/gi, " ")
    .replace(/\b\d+\s*mg\b/gi, " ")
    .replace(/[—–-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Keep accents roughly via original tokens if possible
  return s
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

async function main() {
  const rows = await prisma.product.findMany({
    where: {
      manufacturer: { slug: "liquidarom" },
      range: { in: ["Ice Cool", "Ice Cool X"] },
      visibleOnline: true,
      isActive: true,
    },
    select: { id: true, name: true, range: true, stock: true, productType: true },
  });

  let n = 0;
  for (const p of rows) {
    const flavor = titleFromName(p.name, p.range || "");
    const format = /100/i.test(p.productType || "") ? "100 ml" : "50 ml";
    const clean = `Liquidarom — ${p.range} — ${flavor} ${format}`;
    if (clean === p.name) continue;
    console.log(`${APPLY ? "[ok]" : "[dry]"} ${p.name} => ${clean} (stock=${p.stock})`);
    n++;
    if (APPLY) {
      await prisma.product.update({
        where: { id: p.id },
        data: { name: clean, brand: "Liquidarom" },
      });
    }
  }
  console.log({ mode: APPLY ? "apply" : "dry-run", renamed: n });
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
