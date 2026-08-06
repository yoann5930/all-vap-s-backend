/**
 * Régénère RAPPORT_PHOTOTHEQUE.md depuis le JSON + vérifie l'état DB.
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma";

async function main() {
  const reportPath = path.resolve("data/phototheque/RAPPORT_PHOTOTHEQUE.json");
  const mdPath = path.resolve("data/phototheque/RAPPORT_PHOTOTHEQUE.md");
  const j = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const rows = j.produits || [];

  const md = `# Rapport photothèque officielle All Vap's

Date : ${j.date || new Date().toISOString()} (mis à jour après correction formats)

## Synthèse

| Métrique | Valeur |
|---|---|
| Produits validés | ${j.totalValides} |
| Photos officielles trouvées | ${j.photosTrouvees} |
| Images améliorées (fond All Vap's) | ${j.photosAmeliorees} |
| Images manquantes | ${j.photosManquantes} |
| Couverture | ${j.couverturePct} % |
| Médiathèque | \`public/media/products/{fabricant}/{gamme}/{format}/\` |

## Détail par produit

| Produit | Famille | Photo | Source | Améliorée | Manquante | Anomalies |
|---|---|---|---|---|---|---|
${rows
  .map(
    (r: {
      name: string;
      family: string;
      photoOfficielleTrouvee: string;
      sourceType: string;
      imageAmelioree: string;
      imageManquante: boolean;
      anomalies: string[];
    }) =>
      `| ${(r.name || "").replace(/\|/g, "/")} | ${r.family || ""} | ${r.photoOfficielleTrouvee} | ${
        r.sourceType || "—"
      } | ${r.imageAmelioree} | ${r.imageManquante ? "oui" : "non"} | ${((r.anomalies || []).join("; ") || "—").replace(/\|/g, "/")} |`
  )
  .join("\n")}

## Manquants (action requise)

${rows
  .filter((r: { photoOfficielleTrouvee: string }) => r.photoOfficielleTrouvee !== "oui")
  .map(
    (r: { name: string; family: string; anomalies: string[] }) =>
      `- **${r.name}** (${r.family}) — ${(r.anomalies || []).join("; ") || "photo manquante"}`
  )
  .join("\n")}

## Corrections récentes

- Pastis 13 et Le P'tit Blond : photos au mauvais format (10ml / 200ml) retirées — en attente packshot officiel 50ml.
- Matching format durci dans \`build-official-phototheque.ts\` (rejet URL/fichier déclarant un autre format).
`;

  fs.writeFileSync(mdPath, md, "utf8");

  const withImg = await prisma.product.count({
    where: { catalogStatus: "valide", imageStatus: "official" },
  });
  const noImg = await prisma.product.count({
    where: {
      catalogStatus: "valide",
      OR: [{ imageUrl: null }, { imageStatus: { not: "official" } }],
    },
  });
  const cleaned = await prisma.product.findMany({
    where: {
      catalogStatus: "valide",
      OR: [
        { name: { contains: "Pastis", mode: "insensitive" } },
        { name: { contains: "P'tit Blond", mode: "insensitive" } },
      ],
    },
    select: { name: true, imageUrl: true, imageStatus: true, visibleOnline: true, importAnomaly: true },
  });

  console.log(
    JSON.stringify(
      {
        report: { found: j.photosTrouvees, missing: j.photosManquantes, pct: j.couverturePct },
        db: { withImg, noImg },
        cleaned,
        mdUpdated: true,
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
