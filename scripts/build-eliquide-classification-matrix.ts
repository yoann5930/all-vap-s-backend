/**
 * Analyse SumUp + inventaire vente + DB → matrice de classification e-liquides.
 * Lecture seule. Aucune écriture stock.
 *
 * Usage: npx tsx scripts/build-eliquide-classification-matrix.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  classifyProductName,
  type ClassifiedProductRow,
} from "../lib/catalog/eliquide-classification";
import { loadKnownManufacturers } from "../lib/catalog/sumup-eliquide-manufacturers";
import { parseCsv } from "../lib/import/csv";

const ROOT = process.cwd();
const SUMUP = path.join(
  ROOT,
  "inbox_sumup",
  "2026-08-03_16-46-54_items-export_MCGR4RXU.csv"
);
const INV = path.join(
  ROOT,
  "data",
  "inventaire",
  "Inventaire_Produits_Tarifs_Vente_All_Vaps.csv"
);
const OUT_JSON = path.join(ROOT, "rapports", "classification-eliquide-matrix-latest.json");
const OUT_MD = path.join(ROOT, "docs", "CLASSIFICATION_ELIQUIDES_FABRICANT_GAMME.md");

function parseInventaireCsv(raw: string): Array<{
  barcode: string;
  reference: string;
  product: string;
  brand: string;
  category: string;
}> {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  // header: Code-barres;Référence;Produit;Marque;Catégorie;...
  const rows: Array<{
    barcode: string;
    reference: string;
    product: string;
    brand: string;
    category: string;
  }> = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i]!.split(";");
    const barcode = (parts[0] || "").trim();
    const reference = (parts[1] || "").trim();
    let product = (parts[2] || "").trim();
    const brand = (parts[3] || "").trim();
    const category = (parts[4] || "").trim();
    // Nettoyer préfixe prix collé : "10 5,20 ? 52,00 ? Nom..."
    product = product
      .replace(/^\d+\s+[\d,.]+\s*[€?]?\s*[\d,.]+\s*[€?]?\s*/u, "")
      .replace(/^\d+\s+[\d,.]+\s*[€?]\s*/u, "")
      .trim();
    if (!product) continue;
    rows.push({ barcode, reference, product, brand, category });
  }
  return rows;
}

function countByStatus(rows: ClassifiedProductRow[]) {
  const c = {
    CONFIRMED: 0,
    AUTO_CLASSIFIED: 0,
    TO_REVIEW: 0,
    UNCLASSIFIED: 0,
  };
  for (const r of rows) c[r.classificationStatus] += 1;
  return c;
}

async function loadDbSnapshot(): Promise<ClassifiedProductRow[]> {
  try {
    const prisma = (await import("../lib/prisma")).default;
    const products = await prisma.product.findMany({
      select: {
        name: true,
        sumupName: true,
        category: true,
        sku: true,
        barcode: true,
        sumupProductId: true,
        manufacturer: { select: { slug: true, name: true } },
        rangeRef: { select: { slug: true, name: true } },
        volumeMl: true,
      },
      take: 20000,
    });
    await prisma.$disconnect();
    const known = loadKnownManufacturers();
    return products.map((p) => {
      const raw = (p.sumupName || p.name || "").trim();
      const base = classifyProductName({
        rawName: raw,
        category: p.category,
        sku: p.sku,
        barcode: p.barcode,
        sumupItemId: p.sumupProductId,
        sourceFiles: ["db:Product"],
        known,
      });
      // Prefer DB links if already set
      if (p.manufacturer?.slug) {
        base.manufacturerSlug = p.manufacturer.slug;
        base.manufacturerName = p.manufacturer.name;
        if (!base.sources.includes("db_manufacturer")) {
          base.sources.push("db_manufacturer");
        }
      }
      if (p.rangeRef?.slug) {
        base.rangeSlug = p.rangeRef.slug;
        base.rangeName = p.rangeRef.name;
        if (!base.sources.includes("db_range")) base.sources.push("db_range");
        if (
          base.classificationStatus === "UNCLASSIFIED" ||
          base.classificationStatus === "AUTO_CLASSIFIED"
        ) {
          base.classificationStatus = "CONFIRMED";
        }
      }
      if (p.volumeMl && !base.volumeMl) base.volumeMl = p.volumeMl;
      return base;
    });
  } catch (e) {
    console.warn("DB snapshot skipped:", e instanceof Error ? e.message : e);
    return [];
  }
}

async function main() {
  const known = loadKnownManufacturers();
  const sumupRaw = fs.readFileSync(SUMUP, "utf8");
  const sumupRows = parseCsv(sumupRaw);
  const sumupClassified: ClassifiedProductRow[] = [];
  for (const r of sumupRows) {
    const name = (r["Item name"] || r["item name"] || "").trim();
    if (!name) continue;
    sumupClassified.push(
      classifyProductName({
        rawName: name,
        category: r["Category"] || r["category"] || "",
        sku: r["SKU"] || r["sku"] || null,
        barcode: r["Barcode"] || r["barcode"] || null,
        sumupItemId: r["Item id (Do not change)"] || null,
        sourceFiles: [path.basename(SUMUP)],
        known,
      })
    );
  }

  const invRaw = fs.existsSync(INV)
    ? fs.readFileSync(INV, "utf8")
    : "";
  const invRows = invRaw ? parseInventaireCsv(invRaw) : [];
  const invClassified: ClassifiedProductRow[] = invRows.map((r) =>
    classifyProductName({
      rawName: r.product,
      category: r.category || r.brand,
      sku: r.reference || null,
      barcode: r.barcode || null,
      sourceFiles: [path.basename(INV)],
      known,
    })
  );

  const dbClassified = await loadDbSnapshot();

  // Unique by normalized raw name (prefer CONFIRMED > AUTO > TO_REVIEW > UNCLASSIFIED)
  const rank = (s: string) =>
    ({ CONFIRMED: 0, AUTO_CLASSIFIED: 1, TO_REVIEW: 2, UNCLASSIFIED: 3 } as Record<
      string,
      number
    >)[s] ?? 9;
  const uniqueMap = new Map<string, ClassifiedProductRow>();
  for (const row of [...sumupClassified, ...invClassified, ...dbClassified]) {
    if (!row.isEliquid && row.classificationStatus === "UNCLASSIFIED") continue;
    const key = `${row.rawName}`.toLowerCase().trim();
    const prev = uniqueMap.get(key);
    if (!prev || rank(row.classificationStatus) < rank(prev.classificationStatus)) {
      const merged = { ...row };
      if (prev) {
        merged.sourceFiles = [...new Set([...prev.sourceFiles, ...row.sourceFiles])];
        merged.sources = [...new Set([...prev.sources, ...row.sources])];
      }
      uniqueMap.set(key, merged);
    } else if (prev) {
      prev.sourceFiles = [...new Set([...prev.sourceFiles, ...row.sourceFiles])];
    }
  }
  const unique = [...uniqueMap.values()];
  const eliquidOnly = unique.filter((u) => u.isEliquid);

  const byMfr = new Map<
    string,
    { name: string; ranges: Set<string>; products: number; toReview: number }
  >();
  for (const u of eliquidOnly) {
    if (!u.manufacturerSlug) continue;
    const cur = byMfr.get(u.manufacturerSlug) || {
      name: u.manufacturerName || u.manufacturerSlug,
      ranges: new Set<string>(),
      products: 0,
      toReview: 0,
    };
    cur.products += 1;
    if (u.rangeSlug) cur.ranges.add(u.rangeSlug);
    if (u.classificationStatus === "TO_REVIEW") cur.toReview += 1;
    byMfr.set(u.manufacturerSlug, cur);
  }

  const statusCounts = countByStatus(eliquidOnly);
  const allRanges = new Set(
    eliquidOnly.map((u) => u.rangeSlug).filter(Boolean) as string[]
  );
  const withoutMfr = eliquidOnly.filter((u) => !u.manufacturerSlug);
  const mfrWithoutRange = [...byMfr.entries()]
    .filter(([, v]) => [...v.ranges].every((r) => r === "a-classer") || v.ranges.size === 0)
    .map(([slug]) => slug);

  const report = {
    generatedAt: new Date().toISOString(),
    sources: {
      sumup: SUMUP,
      inventaire: fs.existsSync(INV) ? INV : null,
      dbProducts: dbClassified.length,
    },
    sumupRowsAnalyzed: sumupRows.length,
    inventaireRowsAnalyzed: invRows.length,
    uniqueProducts: unique.length,
    eliquidProducts: eliquidOnly.length,
    manufacturers: byMfr.size,
    ranges: allRanges.size,
    statusCounts,
    manufacturersDetail: [...byMfr.entries()]
      .map(([slug, v]) => ({
        slug,
        name: v.name,
        ranges: v.ranges.size,
        rangeSlugs: [...v.ranges].sort(),
        products: v.products,
        toReview: v.toReview,
      }))
      .sort((a, b) => b.products - a.products),
    manufacturersWithoutMeaningfulRange: mfrWithoutRange,
    productsWithoutManufacturer: withoutMfr.length,
    sampleWithoutManufacturer: withoutMfr.slice(0, 30).map((u) => u.rawName),
    sampleToReview: eliquidOnly
      .filter((u) => u.classificationStatus === "TO_REVIEW")
      .slice(0, 30)
      .map((u) => ({ rawName: u.rawName, reason: u.reason })),
    rows: eliquidOnly,
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), "utf8");

  const md: string[] = [
    `# Classification e-liquides — Fabricant → Gamme → Produit`,
    ``,
    `Généré : ${report.generatedAt}`,
    ``,
    `## Sources`,
    `- SumUp : \`${path.basename(SUMUP)}\``,
    `- Inventaire : \`${fs.existsSync(INV) ? path.basename(INV) : "ABSENT"}\``,
    `- Produits DB : ${dbClassified.length}`,
    ``,
    `## Stats`,
    `| Métrique | Valeur |`,
    `|----------|--------|`,
    `| Lignes SumUp | ${report.sumupRowsAnalyzed} |`,
    `| Lignes inventaire | ${report.inventaireRowsAnalyzed} |`,
    `| Produits uniques (e-liquide) | ${report.eliquidProducts} |`,
    `| Fabricants | ${report.manufacturers} |`,
    `| Gammes (slugs) | ${report.ranges} |`,
    `| CONFIRMED | ${statusCounts.CONFIRMED} |`,
    `| AUTO_CLASSIFIED | ${statusCounts.AUTO_CLASSIFIED} |`,
    `| TO_REVIEW | ${statusCounts.TO_REVIEW} |`,
    `| UNCLASSIFIED | ${statusCounts.UNCLASSIFIED} |`,
    ``,
    `## Par fabricant`,
    ``,
  ];
  for (const m of report.manufacturersDetail) {
    md.push(
      `- **${m.name}** (\`${m.slug}\`) — ${m.products} produits, ${m.ranges} gammes, à revoir: ${m.toReview}`
    );
  }
  md.push(``, `## Produits sans fabricant (échantillon)`, ``);
  for (const n of report.sampleWithoutManufacturer.slice(0, 20)) {
    md.push(`- ${n}`);
  }
  md.push(``, `## Stocks`, `Stocks modifiés : **NON** (analyse seule)`, ``);
  fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
  fs.writeFileSync(OUT_MD, md.join("\n"), "utf8");

  console.log(
    JSON.stringify(
      {
        sumup: report.sumupRowsAnalyzed,
        inventaire: report.inventaireRowsAnalyzed,
        eliquid: report.eliquidProducts,
        manufacturers: report.manufacturers,
        ranges: report.ranges,
        statusCounts,
        outJson: OUT_JSON,
        outMd: OUT_MD,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
