/**
 * Génère data/catalog/sumup-item-barcodes.json depuis le CSV SumUp inbox.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CSV = path.join(
  ROOT,
  "inbox_sumup",
  "2026-08-03_16-46-54_items-export_MCGR4RXU.csv"
);
const OUT = path.join(ROOT, "data", "catalog", "sumup-item-barcodes.json");

function parseCsv(text: string): Record<string, string>[] {
  const raw = text.replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((l) => l.length);
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
  const rows: Record<string, string>[] = [];
  let buf = "";
  for (let i = 1; i < lines.length; i++) {
    buf += (buf ? "\n" : "") + lines[i];
    if ((buf.match(/"/g) || []).length % 2) continue;
    const cols = split(buf);
    buf = "";
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] || "").replace(/^\t/, "").trim();
    });
    rows.push(row);
  }
  return rows;
}

function normalizeEan(raw: string): string | null {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 14) return null;
  return digits;
}

const rows = parseCsv(fs.readFileSync(CSV, "utf8"));
const map: Record<string, string> = {};
for (const r of rows) {
  const id = (r["Item id (Do not change)"] || "").trim();
  const ean = normalizeEan(r["Barcode"] || "");
  if (id && ean) map[id] = ean;
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: path.basename(CSV),
      count: Object.keys(map).length,
      map,
    },
    null,
    0
  ),
  "utf8"
);
console.log(JSON.stringify({ out: OUT, count: Object.keys(map).length }));
