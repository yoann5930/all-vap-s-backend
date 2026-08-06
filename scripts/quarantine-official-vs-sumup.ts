import prisma from "../lib/prisma";
import { normalizeCatalogKey, quarantineDuplicateProduct } from "../lib/catalog/assert-no-duplicates";

/** Quasi-doublon strict : tous les tokens significatifs doivent matcher, y compris A/B/C. */
function isSameProduct(a: string, b: string): boolean {
  const na = normalizeCatalogKey(a);
  const nb = normalizeCatalogKey(b);
  if (na === nb) return true;
  const tokensA = na.split(" ").filter((t) => t.length >= 1 && t !== "ml");
  const tokensB = new Set(nb.split(" ").filter((t) => t.length >= 1 && t !== "ml"));
  // Lettres distinctives A/B/C
  const letterA = tokensA.find((t) => /^[abc]$/.test(t));
  const letterB = [...tokensB].find((t) => /^[abc]$/.test(t));
  if (letterA && letterB && letterA !== letterB) return false;
  const significant = tokensA.filter((t) => t.length > 2 || /^[abc]$/.test(t));
  if (significant.length === 0) return false;
  const hits = significant.filter((t) => tokensB.has(t) || nb.includes(t)).length;
  return hits / significant.length >= 0.85;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const official = await prisma.product.findMany({
    where: {
      source: "official_catalog",
      OR: [{ isActive: true }, { importAnomaly: { contains: "quasi_official" } }],
    },
    select: {
      id: true,
      name: true,
      rangeId: true,
      volumeMl: true,
      normalizedName: true,
      isActive: true,
    },
  });

  let n = 0;
  for (const o of official) {
    if (!o.rangeId) continue;
    const peers = await prisma.product.findMany({
      where: {
        rangeId: o.rangeId,
        id: { not: o.id },
        sumupProductId: { not: null },
        ...(o.volumeMl != null ? { volumeMl: o.volumeMl } : {}),
      },
      select: { id: true, name: true, sumupName: true, volumeMl: true },
    });
    const hit = peers.find((p) =>
      isSameProduct(o.name, [p.name, p.sumupName].filter(Boolean).join(" "))
    );
    if (!hit) continue;
    console.log(`STRICT-DUP drop="${o.name}" keep="${hit.name}"`);
    if (apply) {
      await quarantineDuplicateProduct(prisma, o.id, `strict_official_vs_sumup:${hit.id}`);
      await prisma.product.update({ where: { id: o.id }, data: { rangeId: null } });
    }
    n++;
  }
  console.log({ apply, quarantined: n });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
