/**
 * Génère data/catalog/sumup-item-barcodes.json depuis le CSV SumUp inbox.
 * Inclut map Item id → EAN et nameMap (noms uniques → EAN uniquement).
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

function normName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const rows = parseCsv(fs.readFileSync(CSV, "utf8"));
const map: Record<string, string> = {};
const nameEans = new Map<string, Set<string>>();
const nameOriginal = new Map<string, string>();

for (const r of rows) {
  const id = (r["Item id (Do not change)"] || "").trim();
  const ean = normalizeEan(r["Barcode"] || "");
  const nameRaw = (r["Item name"] || r["Name"] || "").trim();
  if (id && ean) map[id] = ean;
  if (nameRaw && ean) {
    const key = normName(nameRaw);
    if (!key) continue;
    if (!nameEans.has(key)) nameEans.set(key, new Set());
    nameEans.get(key)!.add(ean);
    if (!nameOriginal.has(key)) nameOriginal.set(key, nameRaw);
  }
}

const nameMap: Record<string, string> = {};
for (const [key, eans] of nameEans) {
  if (eans.size !== 1) continue;
  nameMap[nameOriginal.get(key) || key] = [...eans][0]!;
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: path.basename(CSV),
      count: Object.keys(map).length,
      nameCount: Object.keys(nameMap).length,
      map,
      nameMap,
    },
    null,
    0
  ),
  "utf8"
);
console.log(
  JSON.stringify({
    out: OUT,
    count: Object.keys(map).length,
    nameCount: Object.keys(nameMap).length,
  })
);
