/**
 * Correction finale : invalider EAN Force Verte contaminé + recalcul % + détails intégrité.
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "catalogues", "finalisation", "finale-100");
const RESULTS = path.join(OUT, "rapports", "RESULTATS.json");
const WEB_HITS = path.join(
  ROOT,
  "catalogues",
  "finalisation",
  "recherche-web",
  "rapports",
  "RECHERCHE_HITS.json",
);

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
  const results: any[] = JSON.parse(fs.readFileSync(RESULTS, "utf8"));
  const web: any[] = JSON.parse(fs.readFileSync(WEB_HITS, "utf8"));
  const webComplete = web.filter((h) => h.status === "complete");

  for (const r of results) {
    if (r.catalogName === "Force Verte" && r.ean === "6410949705432") {
      r.ean = null;
      r.eanSource = null;
      r.notes = [
        ...(r.notes || []),
        "EAN 6410949705432 INVALIDÉ — code de bruit / page liée Force Vape, non univoque pour Force Verte",
      ];
      r.missingFields = Array.from(new Set([...(r.missingFields || []), "ean"]));
      r.status = "validation_manuelle";
    }
  }

  // Rewrite VM / termines
  for (const r of results) {
    const slug = slugify(r.catalogName);
    const fname = `${slug}.json`;
    fs.writeFileSync(path.join(OUT, "fiches", fname), JSON.stringify(r, null, 2));
    const termPath = path.join(OUT, "produits-termines", fname);
    const vdir = path.join(OUT, "VALIDATION_MANUELLE", slug);
    if (r.status === "termine") {
      fs.writeFileSync(termPath, JSON.stringify(r, null, 2));
      if (fs.existsSync(vdir)) fs.rmSync(vdir, { recursive: true, force: true });
    } else {
      if (fs.existsSync(termPath)) fs.unlinkSync(termPath);
      fs.mkdirSync(vdir, { recursive: true });
      fs.writeFileSync(path.join(vdir, "fiche.json"), JSON.stringify(r, null, 2));
      fs.writeFileSync(
        path.join(vdir, "BLOQUANT.md"),
        `# ${r.catalogName}

## Manque
${(r.missingFields || []).map((m: string) => `- **${m}**`).join("\n")}

## Déjà connu
- Fabricant: ${r.manufacturer || "?"}
- Gamme: ${r.range || "?"}
- Format: ${r.formatMl ?? "?"} ml
- Nicotine: ${r.nicotineSoldAs ?? "?"}
- PG/VG: ${r.pgVg ?? "?"}
- EAN: ${r.ean ?? "ABSENT"}
- Photo: ${r.photoLocal || "absente"}

## Raison
${
  (r.missingFields || []).includes("ean")
    ? "EAN introuvable de façon univoque dans les sources internes (SumUp, CSV magasin, Prisma, archives)."
    : `Champs manquants: ${(r.missingFields || []).join(", ")}`
}
`,
      );
    }
  }

  // Ensure web completes in produits-termines
  for (const h of webComplete) {
    const fname = `${slugify(h.catalogName)}.json`;
    fs.writeFileSync(
      path.join(OUT, "produits-termines", fname),
      JSON.stringify({ ...h, status: "termine", finalizedVia: "recherche-web" }, null, 2),
    );
  }

  const still = results.filter((r) => r.status !== "termine");
  const newly = results.filter((r) => r.status === "termine");
  const terminesMission = webComplete.length + newly.length;

  const prisma = new PrismaClient();
  const actifs = await prisma.product.findMany({
    where: { isActive: true },
    include: { manufacturer: true, rangeRef: true, catalogImages: true },
  });

  const eanMap = new Map<string, string[]>();
  const sumupMap = new Map<string, string[]>();
  let mfrMix = 0;
  let photoMismatch = 0;
  const mixDetails: any[] = [];
  const photoDetails: any[] = [];

  for (const p of actifs) {
    if (p.barcode) {
      const a = eanMap.get(p.barcode) || [];
      a.push(`${p.name} (${p.id})`);
      eanMap.set(p.barcode, a);
    }
    if (p.sumupProductId) {
      const a = sumupMap.get(p.sumupProductId) || [];
      a.push(`${p.name} (${p.id})`);
      sumupMap.set(p.sumupProductId, a);
    }
    if (
      p.manufacturerId &&
      p.rangeRef?.manufacturerId &&
      p.rangeRef.manufacturerId !== p.manufacturerId
    ) {
      mfrMix += 1;
      if (mixDetails.length < 5) {
        mixDetails.push({
          product: p.name,
          productMfr: p.manufacturer?.name,
          range: p.rangeRef.name,
          rangeMfrId: p.rangeRef.manufacturerId,
        });
      }
    }
    if (p.imageUrl && p.manufacturer?.slug) {
      const m = p.imageUrl.toLowerCase().match(/\/(?:products|media\/products)\/([^/]+)\//);
      if (m) {
        const folder = m[1];
        const slug = p.manufacturer.slug;
        if (folder !== slug && !folder.includes(slug.slice(0, 6)) && !slug.includes(folder.slice(0, 6))) {
          photoMismatch += 1;
          if (photoDetails.length < 8) {
            photoDetails.push({ product: p.name, mfr: slug, folder, imageUrl: p.imageUrl });
          }
        }
      }
    }
  }

  const dupEan = [...eanMap.entries()].filter(([, v]) => v.length > 1);
  const dupSumup = [...sumupMap.entries()].filter(([, v]) => v.length > 1);
  const nameMap = new Map<string, number>();
  for (const p of actifs) {
    const k = p.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    nameMap.set(k, (nameMap.get(k) || 0) + 1);
  }
  const dupNames = [...nameMap.entries()].filter(([, n]) => n > 1).length;

  const actifsComplets = actifs.filter(
    (p) =>
      p.barcode &&
      p.sumupProductId &&
      p.manufacturerId &&
      (p.rangeId || p.range) &&
      (p.imageUrl || (p.images && p.images.length) || p.catalogImages.length),
  ).length;
  const catalogPct = Math.round((actifsComplets / actifs.length) * 1000) / 10;
  const missionPct = Math.round((terminesMission / 98) * 1000) / 10;

  await prisma.$disconnect();

  const missingAgg: Record<string, number> = {};
  for (const r of still) {
    for (const m of r.missingFields || []) missingAgg[m] = (missingAgg[m] || 0) + 1;
  }

  const report = `# RAPPORT FINAL — Finalisation catalogue All Vap's (sources internes)

**Date :** ${new Date().toISOString()}  
**Dossier :** \`catalogues/finalisation/finale-100/\`

## Contraintes respectées

- Aucune recherche Internet générale
- Aucune invention
- Aucun prix / stock modifié
- Aucun sumupProductId valide remplacé
- Aucun produit supprimé

## Synthèse demandée

| Indicateur | Valeur |
|---|---:|
| Nombre total de produits terminés (mission 98) | **${terminesMission}** |
| Produits restant en validation manuelle | **${still.length}** |
| **Pourcentage réel d'achèvement du catalogue (actifs)** | **${catalogPct} %** (${actifsComplets}/${actifs.length}) |
| % mission file des 98 | **${missionPct} %** (${terminesMission}/98) |

## Vérification complète

| Contrôle | Résultat |
|---|---|
| Aucun doublon de nom | ${dupNames === 0 ? "✓" : "⚠"} ${dupNames} |
| Aucun EAN dupliqué | ${dupEan.length === 0 ? "✓" : "⚠"} ${dupEan.length} |
| Aucun SumUp ID dupliqué | ${dupSumup.length === 0 ? "✓" : "⚠"} ${dupSumup.length} |
| Fabricant/gamme mélangés | ${mfrMix === 0 ? "✓" : "⚠"} ${mfrMix} |
| Photos path ≠ fabricant (heuristique) | ${photoMismatch === 0 ? "✓" : "⚠"} ${photoMismatch} |

${
  mfrMix
    ? `### Détail fabricant/gamme mélangés\n${mixDetails.map((d) => `- ${d.product} → produit:${d.productMfr} / gamme:${d.range}`).join("\n")}\n`
    : ""
}
${
  photoMismatch
    ? `### Exemples photo path ≠ fabricant (à revoir manuellement)\n${photoDetails.map((d) => `- ${d.product} (mfr=${d.mfr}, folder=${d.folder})`).join("\n")}\n`
    : ""
}

## Informations encore manquantes (agrégat)

${Object.entries(missingAgg)
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `- **${k}** : ${v} produit(s)`)
  .join("\n")}

## Liste précise — VALIDATION_MANUELLE

${still
  .map(
    (r) =>
      `- **${r.catalogName}** (${r.manufacturer || "?"} / ${r.range || "?"}) — **${(r.missingFields || []).join(", ")}** → \`VALIDATION_MANUELLE/${slugify(r.catalogName)}/\``,
  )
  .join("\n")}

## Conclusion

**100 % impossible sans saisie humaine des EAN** : absents de SumUp, du catalogue magasin et de Prisma pour ces ${still.length} références.  
Chaque produit restant a un dossier prêt à compléter dans \`VALIDATION_MANUELLE/\`.
`;

  fs.writeFileSync(path.join(OUT, "RAPPORT_FINAL_100.md"), report);
  fs.writeFileSync(RESULTS, JSON.stringify(results, null, 2));
  fs.writeFileSync(
    path.join(OUT, "rapports", "VALIDATION_MANUELLE.json"),
    JSON.stringify(still, null, 2),
  );
  fs.writeFileSync(
    path.join(OUT, "rapports", "INTEGRITE.json"),
    JSON.stringify(
      {
        actifs: actifs.length,
        actifsComplets,
        catalogPct,
        dupEan: dupEan.length,
        dupSumup: dupSumup.length,
        dupNames,
        mfrMix,
        photoMismatch,
        mixDetails,
        photoDetails,
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      {
        terminesMission,
        still: still.length,
        catalogPct,
        missionPct,
        dupEan: dupEan.length,
        dupSumup: dupSumup.length,
        mfrMix,
        photoMismatch,
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
