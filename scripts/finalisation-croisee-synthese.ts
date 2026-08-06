/**
 * Synthèse finale croisée + copie des 37 complets web + % catalogue Prisma.
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "catalogues", "finalisation", "croisee");
const WEB_HITS = path.join(
  ROOT,
  "catalogues",
  "finalisation",
  "recherche-web",
  "rapports",
  "RECHERCHE_HITS.json",
);
const ARCHIVE = path.join(OUT, "rapports", "RESULTATS.json");

function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

async function main() {
  const web: any[] = JSON.parse(fs.readFileSync(WEB_HITS, "utf8"));
  const archive: any[] = JSON.parse(fs.readFileSync(ARCHIVE, "utf8"));
  const webComplete = web.filter((h) => h.status === "complete");
  const still = archive.filter((r) => r.status !== "finalise");

  fs.mkdirSync(path.join(OUT, "produits-finalises"), { recursive: true });
  for (const h of webComplete) {
    const fiche = {
      ...h,
      finalizedVia: "recherche-web",
      constraints: {
        priceUntouched: true,
        stockUntouched: true,
        sumupIdUntouched: true,
        appliedToDatabase: false,
      },
    };
    fs.writeFileSync(
      path.join(OUT, "produits-finalises", `${slugify(h.catalogName)}.json`),
      JSON.stringify(fiche, null, 2),
    );
  }

  const prisma = new PrismaClient();
  const actifs = await prisma.product.count({ where: { isActive: true } });
  const actifsComplets = await prisma.product.count({
    where: {
      isActive: true,
      barcode: { not: null },
      sumupProductId: { not: null },
      manufacturerId: { not: null },
      rangeId: { not: null },
      NOT: { barcode: "" },
      OR: [{ imageUrl: { not: null } }, { imageStatus: "official" }, { images: { isEmpty: false } }],
    },
  });
  await prisma.$disconnect();

  const catalogPct = actifs ? Math.round((actifsComplets / actifs) * 1000) / 10 : 0;
  const missionDone = webComplete.length; // archive finalized 0 after invalidation
  const missionPct = Math.round((missionDone / 98) * 1000) / 10;

  const reasonCount: Record<string, number> = {};
  for (const r of still) {
    const key = (r.missingFields || []).sort().join("+") || "inconnu";
    reasonCount[key] = (reasonCount[key] || 0) + 1;
  }

  const vmCount = fs.existsSync(path.join(OUT, "VALIDATION_MANUELLE"))
    ? fs.readdirSync(path.join(OUT, "VALIDATION_MANUELLE")).filter((d) =>
        fs.statSync(path.join(OUT, "VALIDATION_MANUELLE", d)).isDirectory(),
      ).length
    : 0;

  const report = `# RAPPORT FINAL — Finalisation définitive catalogue All Vap's

**Date :** ${new Date().toISOString()}  
**Dossier :** \`catalogues/finalisation/croisee/\`

## Contraintes

✓ Aucune invention  
✓ Aucun prix modifié  
✓ Aucun stock modifié  
✓ Aucun produit supprimé  
✓ Aucun sumupProductId remplacé en base  

## Synthèse demandée

| Indicateur | Valeur |
|---|---:|
| Produits totalement finalisés (web + archives) | **${missionDone}** |
| Produits récupérés grâce aux archives (nouveaux finalisés EAN) | **0** |
| Photos associées depuis le projet (passe croisée) | voir dossiers photos / VALIDATION_MANUELLE |
| Produits encore incomplets | **${still.length}** |
| Dossiers VALIDATION_MANUELLE | **${vmCount}** |
| **% achèvement mission des 98** | **${missionPct} %** (${missionDone}/98) |
| Produits actifs catalogue | **${actifs}** |
| Actifs complets (SumUp + EAN + fabricant + gamme + image) | **${actifsComplets}** |
| **% achèvement réel du catalogue actifs** | **${catalogPct} %** |

## Produits totalement finalisés

Les **${webComplete.length}** fiches complètes issues de la recherche web sont dans  
\`catalogues/finalisation/croisee/produits-finalises/\`  
(et \`catalogues/finalisation/recherche-web/\`).

La recherche croisée archives **n'a pas permis de finaliser de nouveau produit** :
les EAN manquants sont absents de Prisma et absents ou ambigus dans les CSV SumUp.

## Produits récupérés grâce aux archives

- **0 finalisation EAN supplémentaire** (CSV SumUp sans barcode univoque pour ces références)
- Photos / bannières / preuves documentées dans chaque dossier \`VALIDATION_MANUELLE/<slug>/\`
- Candidats SumUp ID **documentés mais non appliqués**

## Agrégation des blocages (${still.length} incomplets)

${Object.entries(reasonCount)
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `- **${k}** → ${v} produit(s)`)
  .join("\n")}

## Liste — encore incomplets (raison précise)

${still
  .map(
    (r) =>
      `- **${r.catalogName}** (${r.manufacturer || "?"} / ${r.range || "?"}) — manque **${(r.missingFields || []).join(", ")}** → \`VALIDATION_MANUELLE/${slugify(r.catalogName)}/\``,
  )
  .join("\n")}

## Conclusion

Après croisement Prisma + CSV SumUp + rapports + images projet + backups/data/catalogues :

1. **37/98** produits de la file « impossibles » sont entièrement documentés (web).  
2. **61/98** restent bloqués, presque toujours par **absence d'EAN certain**.  
3. Ces 61 sont prêts pour validation humaine dans \`VALIDATION_MANUELLE/\`.  
4. Le catalogue actifs global est à **${catalogPct} %** de complétude stricte (SumUp+EAN+fabricant+gamme+image).
`;

  fs.writeFileSync(path.join(OUT, "RAPPORT_FINALISATION_DEFINITIVE.md"), report);
  fs.writeFileSync(
    path.join(OUT, "rapports", "SYNTHESE_MISSION.json"),
    JSON.stringify(
      {
        missionDone,
        missionTotal: 98,
        missionPct,
        stillIncomplete: still.length,
        validationManuelle: vmCount,
        actifs,
        actifsComplets,
        catalogPct,
        archiveNewFinalized: 0,
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      {
        missionDone,
        missionPct,
        still: still.length,
        vmCount,
        actifs,
        actifsComplets,
        catalogPct,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
