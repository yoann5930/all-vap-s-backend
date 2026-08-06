/**
 * Audit + quarantaine des doublons produits.
 * INTERDICTION DE DOUBLON — conserve le canonical (SumUp > online > non official_catalog).
 *
 * Usage:
 *   npx tsx scripts/audit-and-quarantine-duplicates.ts
 *   npx tsx scripts/audit-and-quarantine-duplicates.ts --apply
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma";
import {
  findDuplicateGroups,
  pickCanonicalDuplicate,
  quarantineDuplicateProduct,
  scanAllProductDuplicates,
  type DuplicateHit,
} from "../lib/catalog/assert-no-duplicates";

async function main() {
  const apply = process.argv.includes("--apply");
  const { hits, onlineHits, totalProducts } = await scanAllProductDuplicates(prisma);

  let quarantined = 0;
  let kept = 0;
  const actions: Array<{
    reason: string;
    key: string;
    keepId: string;
    keepName: string;
    dropIds: string[];
    dropNames: string[];
  }> = [];

  // Dédupliquer les groupes qui se chevauchent : traiter d'abord sumup / barcode / slug
  const priority: Record<string, number> = {
    sumupProductId: 1,
    barcode: 2,
    slug: 3,
    range_name_format: 4,
    flavor_format: 5,
    official_handle: 6,
  };
  const sorted = [...hits].sort(
    (a, b) => (priority[a.reason] || 99) - (priority[b.reason] || 99)
  );

  const alreadyDropped = new Set<string>();

  for (const hit of sorted) {
    const products = await prisma.product.findMany({
      where: { id: { in: hit.productIds } },
      select: {
        id: true,
        name: true,
        slug: true,
        sumupProductId: true,
        visibleOnline: true,
        volumeMl: true,
        productFamily: true,
        barcode: true,
        rangeId: true,
        normalizedName: true,
        source: true,
        isActive: true,
      },
    });
    const active = products.filter((p) => !alreadyDropped.has(p.id));
    if (active.length < 2) continue;

    const { keep, drop } = pickCanonicalDuplicate(active);
    kept++;
    actions.push({
      reason: hit.reason,
      key: hit.key,
      keepId: keep.id,
      keepName: keep.name,
      dropIds: drop.map((d) => d.id),
      dropNames: drop.map((d) => d.name),
    });

    for (const d of drop) {
      alreadyDropped.add(d.id);
      console.log(
        `DOUBLON ${hit.reason} keep="${keep.name}" drop="${d.name}" (${d.id})`
      );
      if (apply) {
        await quarantineDuplicateProduct(
          prisma,
          d.id,
          `${hit.reason}:${hit.key}`
        );
        // Détacher de la gamme pour éviter double affichage catalogue
        await prisma.product.update({
          where: { id: d.id },
          data: { rangeId: null },
        });
      }
      quarantined++;
    }
  }

  // Re-scan online après actions (dry ou apply)
  const afterOnline = apply
    ? (await scanAllProductDuplicates(prisma)).onlineHits
    : onlineHits;

  const stamp = new Date().toISOString().slice(0, 10);
  const outDir = path.resolve("data/catalog/yoann");
  fs.mkdirSync(outDir, { recursive: true });
  const payload = {
    mode: apply ? "apply" : "dry-run",
    generatedAt: new Date().toISOString(),
    totalProducts,
    duplicateGroups: hits.length,
    onlineDuplicateGroupsBefore: onlineHits.length,
    onlineDuplicateGroupsAfter: afterOnline.length,
    quarantined,
    groupsKept: kept,
    actions,
  };
  const jsonPath = path.join(outDir, `AUDIT_DOUBLONS_${stamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));

  const mdPath = path.resolve("docs/RAPPORT_AUDIT_DOUBLONS_PRODUITS.md");
  const md = `# Rapport audit doublons produits

Généré : ${payload.generatedAt}  
Mode : **${payload.mode}**

## Règle

**INTERDICTION DE DOUBLON.**  
Unicité : \`sumupProductId\` · \`slug\` · \`barcode\` · \`rangeId + nom normalisé + format ml\`.

Si doublon → **conserver** la fiche SumUp / online · **quarantiner** le surplus (\`visibleOnline=false\`, \`importAnomaly\`).

## Synthèse

| Indicateur | Valeur |
| --- | ---: |
| Produits scannés | ${totalProducts} |
| Groupes doublons (tous) | ${hits.length} |
| Groupes doublons ONLINE (avant) | ${onlineHits.length} |
| Groupes doublons ONLINE (après) | ${afterOnline.length} |
| Produits mis en quarantaine | ${quarantined} |

## Détail

| Raison | Clé | Conservé | Quarantaine |
| --- | --- | --- | --- |
${actions
  .map(
    (a) =>
      `| ${a.reason} | \`${a.key.slice(0, 60)}\` | ${a.keepName} | ${a.dropNames.join(" · ")} |`
  )
  .join("\n")}

${
  afterOnline.length === 0
    ? `\n## Statut final\n\nAucun doublon **en ligne** restant.\n`
    : `\n## ALERTE\n\nIl reste ${afterOnline.length} groupe(s) de doublons en ligne — intervention manuelle requise.\n`
}

## Commandes

\`\`\`bash
npm run catalog:dedup          # dry-run
npm run catalog:dedup:apply    # quarantaine
\`\`\`
`;
  fs.writeFileSync(mdPath, md);

  console.log(
    JSON.stringify(
      {
        mode: payload.mode,
        totalProducts,
        groups: hits.length,
        onlineBefore: onlineHits.length,
        onlineAfter: afterOnline.length,
        quarantined,
      },
      null,
      2
    )
  );
  console.log(jsonPath);
  console.log(mdPath);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
