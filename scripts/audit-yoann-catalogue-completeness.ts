/**
 * Audit exhaustif ZIP Yoann vs base vs affichage catalogue.
 * Aucune écriture — produit la matrice obligatoire.
 *
 * Usage: npx tsx scripts/audit-yoann-catalogue-completeness.ts
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma";
import { normalizeForMatch } from "../lib/catalog/official-verification";
import { manufacturerLogoUrl } from "../lib/catalog/manufacturer-logo";
import { rangeCoverUrl } from "../lib/catalog/range-cover";

type JsonProduct = { name: string; format_ml?: number; formats_ml?: number[] };
type JsonRange = { name: string; aliases?: string[]; products?: JsonProduct[] };
type JsonMfr = {
  id: string;
  name: string;
  aliases?: string[];
  ranges?: JsonRange[];
  standalone_products?: JsonProduct[];
  website?: string;
};

type RowStatus =
  | "INTÉGRÉE COMPLÈTEMENT"
  | "INTÉGRÉE PARTIELLEMENT"
  | "ABSENTE"
  | "DOUBLON EXISTANT"
  | "MAL RATTACHÉE"
  | "BLOQUÉE PAR INCERTITUDE OFFICIELLE";

function loadJson(): { manufacturers: JsonMfr[]; pending_verification?: string[] } {
  return JSON.parse(
    fs.readFileSync(path.resolve("data/catalog/yoann/allvaps_catalogue.json"), "utf8")
  );
}

async function main() {
  const json = loadJson();
  const manufacturers = await prisma.manufacturer.findMany({
    include: {
      ranges: {
        include: {
          products: {
            where: {
              OR: [
                { visibleOnline: true },
                { sumupProductId: { not: null } },
                { source: { in: ["sumup_csv", "sumup", "yoann"] } },
              ],
            },
            select: {
              id: true,
              name: true,
              visibleOnline: true,
              sumupProductId: true,
              stock: true,
            },
          },
        },
      },
    },
  });

  const rows: Array<Record<string, unknown>> = [];
  let stats = {
    jsonManufacturers: json.manufacturers.length,
    jsonRanges: 0,
    jsonEmptyRanges: 0,
    jsonRangesWithProducts: 0,
    presenteEnBase: 0,
    absente: 0,
    partielle: 0,
    complete: 0,
    bloquee: 0,
  };

  for (const jm of json.manufacturers) {
    const mKeys = [jm.name, jm.id, ...(jm.aliases || [])].map(normalizeForMatch);
    const dbM =
      manufacturers.find((m) => {
        const n = normalizeForMatch(m.name);
        const s = normalizeForMatch(m.slug);
        return mKeys.some((k) => k === n || k === s || n.includes(k) || k.includes(n));
      }) || null;

    for (const jr of jm.ranges || []) {
      stats.jsonRanges++;
      const listed = jr.products?.length || 0;
      if (listed === 0) stats.jsonEmptyRanges++;
      else stats.jsonRangesWithProducts++;

      const rKeys = [jr.name, ...(jr.aliases || [])].map(normalizeForMatch);
      const dbR =
        dbM?.ranges.find((r) => {
          const n = normalizeForMatch(r.name);
          const s = normalizeForMatch(r.slug);
          return rKeys.some((k) => k === n || k === s || n.includes(k) || k.includes(n));
        }) || null;

      const online = dbR?.products.filter((p) => p.visibleOnline).length || 0;
      const sumupLinked =
        dbR?.products.filter((p) => Boolean(p.sumupProductId)).length || 0;
      const totalDb = dbR?.products.length || 0;
      const logo = dbM ? !!manufacturerLogoUrl(dbM.slug) : false;
      const cover =
        dbM && dbR ? !!rangeCoverUrl(dbM.slug, dbR.slug) : false;

      let status: RowStatus;
      if (!dbR) {
        status = "ABSENTE";
        stats.absente++;
      } else if (listed === 0 && totalDb === 0) {
        status = "BLOQUÉE PAR INCERTITUDE OFFICIELLE";
        stats.bloquee++;
      } else if (listed > 0 && online >= listed && online > 0) {
        status = "INTÉGRÉE COMPLÈTEMENT";
        stats.complete++;
      } else if (totalDb > 0 || online > 0) {
        status = "INTÉGRÉE PARTIELLEMENT";
        stats.partielle++;
      } else {
        status = "ABSENTE";
        stats.absente++;
      }
      if (dbR) stats.presenteEnBase++;

      rows.push({
        fabricantJson: jm.name,
        fabricantSlugJson: jm.id,
        gammeJson: jr.name,
        productsInJson: listed,
        productsEmptyMeans: listed === 0 ? "CATALOGUE OFFICIEL À RECHERCHER" : "LISTE FOURNIE",
        presenteEnBase: Boolean(dbR),
        manufacturerDb: dbM?.name || null,
        manufacturerSlug: dbM?.slug || null,
        rangeDb: dbR?.name || null,
        rangeSlug: dbR?.slug || null,
        visibleSurSite: online > 0,
        produitsEnBase: totalDb,
        produitsOnline: online,
        produitsSumUpLies: sumupLinked,
        logoFabricant: logo,
        coverGamme: cover,
        statut: status,
      });
    }
  }

  const outDir = path.resolve("data/catalog/yoann");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const jsonPath = path.join(outDir, `AUDIT_COMPLETENESS_${stamp}.json`);
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        rule: "products:[] = CATALOGUE OFFICIEL À RECHERCHER (jamais ignorer)",
        stats,
        pending_verification: json.pending_verification || [],
        rows,
      },
      null,
      2
    )
  );

  const mdPath = path.join(outDir, `AUDIT_COMPLETENESS_${stamp}.md`);
  const lines = [
    `# Audit import Yoann — complétude gammes (${stamp})`,
    "",
    `Fabricants JSON : **${stats.jsonManufacturers}** · Gammes JSON : **${stats.jsonRanges}** (vides : ${stats.jsonEmptyRanges}, avec produits listés : ${stats.jsonRangesWithProducts})`,
    "",
    `| Fabricant JSON | Gamme JSON | Présente en base | Visible sur le site | Produits intégrés | Statut |`,
    `| --- | --- | ---: | ---: | ---: | --- |`,
    ...rows.map((r) =>
      `| ${r.fabricantJson} | ${r.gammeJson} | ${r.presenteEnBase ? "oui" : "non"} | ${r.visibleSurSite ? "oui" : "non"} | ${r.produitsOnline}/${r.produitsEnBase} (json:${r.productsInJson}) | ${r.statut} |`
    ),
    "",
    `JSON détail : \`${path.basename(jsonPath)}\``,
  ];
  fs.writeFileSync(mdPath, lines.join("\n"));
  console.log(JSON.stringify(stats, null, 2));
  console.log("MD", mdPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
