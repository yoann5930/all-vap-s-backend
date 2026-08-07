/**
 * Audit contenances e-liquides par fabricant (SumUp / catalogue local).
 * Usage: npx tsx scripts/audit-manufacturer-eliquide-volumes.ts
 */
import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "../lib/import/csv";
import {
  analyzeSumUpEliquideManufacturers,
  loadKnownManufacturers,
  norm,
} from "../lib/catalog/sumup-eliquide-manufacturers";
import {
  extractEliquidVolumeMl,
  formatManufacturerVolumeSubtitle,
  isReadyToVapeEliquid,
  productBelongsToManufacturerForVolumes,
  citesForeignManufacturer,
} from "../lib/catalog/manufacturer-volumes";
import prisma from "../lib/prisma";

const ROOT = process.cwd();
const CSV = path.join(
  ROOT,
  "inbox_sumup",
  "2026-08-03_16-46-54_items-export_MCGR4RXU.csv"
);
const OUT_MD = path.join(ROOT, "docs", "AUDIT_ELIQUIDES_CONTENANCES_FABRICANTS.md");
const OUT_JSON = path.join(ROOT, "rapports", "audit-eliquide-contenances-latest.json");

/** Vérifs sites officiels (confirmation, PAS source d'ajout). */
const OFFICIAL_HINTS: Record<string, string> = {
  "vap-air": "Site vapair.fr : catégories 10/50/100 ml visibles — n'afficher que si SumUp All Vap's",
  "vape-maker": "Site vape-maker.com : e-liquides 50 ml typiques — n'afficher que si SumUp",
  "vape-47": "order.vape47.com : 10 ml et 50 ml visibles — n'afficher que si SumUp",
};

function isEliquideRow(category: string, name: string): boolean {
  const c = category.toLowerCase();
  if (/e-?\s*liquide/.test(c)) return true;
  if (!category && /\b\d+\s*ml\b/i.test(name) && name.length <= 120) return true;
  return false;
}

function matchMfr(name: string, known: ReturnType<typeof loadKnownManufacturers>) {
  const n = norm(name);
  const ranked = [...known].sort(
    (a, b) =>
      Math.max(norm(b.name).length, ...b.aliases.map((x) => norm(x).length), 0) -
      Math.max(norm(a.name).length, ...a.aliases.map((x) => norm(x).length), 0)
  );
  for (const m of ranked) {
    const needles = [m.name, ...m.aliases, m.slug.replace(/-/g, " ")]
      .map(norm)
      .filter((x) => x.length >= 3);
    if (needles.some((x) => n.includes(x))) return m;
  }
  return null;
}

async function main() {
  const known = loadKnownManufacturers();
  const analysis = analyzeSumUpEliquideManufacturers(CSV);
  const rows = parseCsv(fs.readFileSync(CSV, "utf8"));

  type Agg = {
    slug: string;
    name: string;
    volumes: Set<number>;
    count: number;
    ambiguous: string[];
    samples: Array<{ name: string; ml: number | null }>;
  };
  const bySlug = new Map<string, Agg>();

  for (const r of rows) {
    const name = (r["item name"] || "").trim();
    if (!name || name.length > 120) continue;
    const category = (r.category || "").trim();
    if (!isEliquideRow(category, name)) continue;
    if (
      !isReadyToVapeEliquid({ name, category }) &&
      !/e-?\s*liquide/i.test(category)
    ) {
      continue;
    }
    // Skip concentrés même en catégorie e-liquide
    if (/\bconcentr[eé]|\bar[oô]me\b|\bbooster\b/i.test(name)) continue;

    const mfr = matchMfr(name, known);
    if (!mfr) continue;

    const hit = extractEliquidVolumeMl({ name });
    if (!bySlug.has(mfr.slug)) {
      bySlug.set(mfr.slug, {
        slug: mfr.slug,
        name: mfr.name,
        volumes: new Set(),
        count: 0,
        ambiguous: [],
        samples: [],
      });
    }
    const agg = bySlug.get(mfr.slug)!;
    agg.count += 1;
    if (!hit) {
      agg.ambiguous.push(name);
      agg.samples.push({ name, ml: null });
    } else {
      agg.volumes.add(hit.ml);
      if (hit.confidence === "low") agg.ambiguous.push(`${name} (multi-ml→${hit.ml})`);
      agg.samples.push({ name, ml: hit.ml });
    }
  }

  // Croisement DB (produits réellement liés fabricant)
  const dbMfrs = await prisma.manufacturer.findMany({
    where: { isActive: true },
    select: {
      id: true,
      slug: true,
      name: true,
      products: {
        select: {
          name: true,
          volumeMl: true,
          productType: true,
          category: true,
          rangeId: true,
          variants: { select: { capacityMl: true } },
        },
      },
    },
  });

  const dbBySlug = new Map<
    string,
    { volumes: number[]; count: number; ambiguous: string[]; subtitle: string }
  >();

  for (const m of dbMfrs) {
    const vols = new Set<number>();
    const ambiguous: string[] = [];
    let count = 0;
    for (const p of m.products) {
      if (!isReadyToVapeEliquid({ name: p.name, category: p.category, productType: p.productType })) {
        continue;
      }
      if (/\bconcentr[eé]/i.test(p.name)) continue;
      if (
        !productBelongsToManufacturerForVolumes({
          productName: p.name,
          manufacturerName: m.name,
          manufacturerSlug: m.slug,
          hasRangeOnManufacturer: Boolean(p.rangeId),
        })
      ) {
        continue;
      }
      if (citesForeignManufacturer(p.name, m.slug)) continue;
      count += 1;
      const hit = extractEliquidVolumeMl({
        name: p.name,
        volumeMl: p.volumeMl,
        productType: p.productType,
        variantCapacityMl: p.variants.map((v) => v.capacityMl),
      });
      if (!hit) ambiguous.push(p.name);
      else {
        vols.add(hit.ml);
        if (hit.confidence === "low") ambiguous.push(`${p.name} (multi-ml→${hit.ml})`);
      }
    }
    const volumes = [...vols].sort((a, b) => a - b);
    dbBySlug.set(m.slug, {
      volumes,
      count,
      ambiguous,
      subtitle: formatManufacturerVolumeSubtitle(volumes),
    });
  }

  const allSlugs = [
    ...new Set([
      ...[...bySlug.keys()],
      ...[...dbBySlug.keys()].filter((s) => (dbBySlug.get(s)?.count || 0) > 0),
      ...analysis.manufacturers.map((m) => m.slug),
    ]),
  ].sort();

  const table = allSlugs.map((slug) => {
    const sumup = bySlug.get(slug);
    const db = dbBySlug.get(slug);
    const displayed = db?.volumes?.length
      ? db.volumes
      : sumup
        ? [...sumup.volumes].sort((a, b) => a - b)
        : [];
    return {
      slug,
      name: sumup?.name || dbMfrs.find((m) => m.slug === slug)?.name || slug,
      sumupVolumes: sumup ? [...sumup.volumes].sort((a, b) => a - b) : [],
      sumupCount: sumup?.count || 0,
      dbVolumes: db?.volumes || [],
      dbCount: db?.count || 0,
      officialHint: OFFICIAL_HINTS[slug] || "—",
      displayedVolumes: displayed,
      subtitle: formatManufacturerVolumeSubtitle(displayed),
      ambiguous: [
        ...(sumup?.ambiguous.slice(0, 8) || []),
        ...(db?.ambiguous.slice(0, 8) || []),
      ],
    };
  });

  const md: string[] = [];
  md.push("# AUDIT — Contenances e-liquides par fabricant");
  md.push("");
  md.push(`**Date :** ${new Date().toISOString()}`);
  md.push(`**Source SumUp :** \`${path.basename(CSV)}\``);
  md.push("");
  md.push(
    "Règle : le site officiel **vérifie** uniquement. L'affichage = volumes des produits **référencés All Vap's / SumUp**."
  );
  md.push("");
  md.push("| Fabricant | Contenances SumUp | Vérification fabricant | Contenances affichées |");
  md.push("|---|---|---|---|");
  for (const row of table.filter((t) => t.sumupCount + t.dbCount > 0)) {
    md.push(
      `| ${row.name} (\`${row.slug}\`) | ${row.sumupVolumes.length ? row.sumupVolumes.map((v) => `${v} ml`).join(", ") : "—"} (${row.sumupCount} prod.) | ${row.officialHint} | **${row.subtitle}** |`
    );
  }
  md.push("");
  md.push("## Produits à contenance incertaine");
  md.push("");
  for (const row of table) {
    if (!row.ambiguous.length) continue;
    md.push(`### ${row.name}`);
    for (const a of [...new Set(row.ambiguous)].slice(0, 15)) {
      md.push(`- \`${a}\``);
    }
    md.push("");
  }

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify({ generatedAt: new Date().toISOString(), table }, null, 2));
  fs.writeFileSync(OUT_MD, md.join("\n"), "utf8");
  console.log(JSON.stringify({ rows: table.length, outMd: OUT_MD, outJson: OUT_JSON }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
