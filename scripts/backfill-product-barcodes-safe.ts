/**
 * Backfill sécurisé Product.barcode — UNIQUEMENT attributions univoques.
 *
 * Usage :
 *   npx tsx scripts/backfill-product-barcodes-safe.ts
 *   npx tsx scripts/backfill-product-barcodes-safe.ts --apply
 */
import fs from "node:fs";
import path from "node:path";
import { runProductBarcodeBackfill } from "../lib/catalog/backfill-product-barcodes";
import prisma from "../lib/prisma";

const APPLY = process.argv.includes("--apply");
const ROOT = process.cwd();
const MAP_JSON = path.join(ROOT, "data", "catalog", "sumup-item-barcodes.json");
const DEFAULT_CSV = path.join(
  ROOT,
  "inbox_sumup",
  "2026-08-03_16-46-54_items-export_MCGR4RXU.csv"
);
const CSV_PATH = (process.env.SUMUP_CSV || DEFAULT_CSV).trim();
const REPORT = path.join(ROOT, "rapports", "backfill-barcodes-safe-latest.json");

type CsvRow = Record<string, string>;

function parseCsv(text: string): CsvRow[] {
  const raw = text.replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((l) => l.length);
  if (!lines.length) return [];
  function split(line: string) {
    const cols: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i]!;
      if (c === '"') {
        if (q && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = !q;
        continue;
      }
      if (c === "," && !q) {
        cols.push(cur);
        cur = "";
        continue;
      }
      cur += c;
    }
    cols.push(cur);
    return cols;
  }
  const headers = split(lines[0]!).map((h) => h.trim());
  const rows: CsvRow[] = [];
  let buf = "";
  for (let i = 1; i < lines.length; i++) {
    buf += (buf ? "\n" : "") + lines[i];
    if ((buf.match(/"/g) || []).length % 2) continue;
    const cols = split(buf);
    buf = "";
    const row: CsvRow = {};
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] || "").replace(/^\t/, "").trim();
    });
    rows.push(row);
  }
  return rows;
}

function normalizeEan(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 14) return null;
  return digits;
}

function loadMap(): Record<string, string> {
  if (fs.existsSync(MAP_JSON)) {
    const j = JSON.parse(fs.readFileSync(MAP_JSON, "utf8")) as {
      map?: Record<string, string>;
    };
    if (j.map && Object.keys(j.map).length) return j.map;
  }
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`Ni map JSON ni CSV: ${MAP_JSON} / ${CSV_PATH}`);
  }
  const map: Record<string, string> = {};
  for (const r of parseCsv(fs.readFileSync(CSV_PATH, "utf8"))) {
    const id = (r["Item id (Do not change)"] || "").trim();
    const ean = normalizeEan(r["Barcode"] || "");
    if (id && ean) map[id] = ean;
  }
  return map;
}

async function main() {
  const sumupItemBarcodes = loadMap();
  const result = await runProductBarcodeBackfill({
    apply: APPLY,
    sumupItemBarcodes,
  });

  const report = {
    generatedAt: new Date().toISOString(),
    csvOrMap: fs.existsSync(MAP_JSON) ? MAP_JSON : CSV_PATH,
    mapCount: Object.keys(sumupItemBarcodes).length,
    ...result,
  };
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2), "utf8");
  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        planned: result.planned,
        bySource: result.bySource,
        applied: result.applied,
        skipped: result.skipped,
        withBarcodeBefore: result.withBarcodeBefore,
        productsTotal: result.productsTotal,
        stillMissingEstimate: result.stillMissingEstimate,
        report: REPORT,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
