/**
 * Diagnostic EAN candidates from SumUp + magasin + referentiel (no invent).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function parseDelimited(line: string, delim: string) {
  const cols: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (c === delim && !q) {
      cols.push(cur);
      cur = "";
    } else cur += c;
  }
  cols.push(cur);
  return cols;
}

function loadCsv(file: string) {
  if (!fs.existsSync(file)) return [] as Record<string, string>[];
  const raw = fs.readFileSync(file, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.length);
  if (!lines.length) return [];
  const delim =
    lines[0].includes(";") && !lines[0].includes("Item name") ? ";" : ",";
  const headers = parseDelimited(lines[0], delim).map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  let buf = "";
  for (let i = 1; i < lines.length; i++) {
    buf += (buf ? "\n" : "") + lines[i];
    if (delim === "," && ((buf.match(/"/g) || []).length) % 2) continue;
    const cols = parseDelimited(buf, delim);
    buf = "";
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] || "").replace(/^\t/, "").trim();
    });
    rows.push(row);
  }
  return rows;
}

function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(s: string) {
  return norm(s)
    .split(" ")
    .filter((t) => t && !["ml", "mg", "by", "e", "liquide"].includes(t));
}

function nameScore(a: string, b: string) {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (!ta.size || !tb.size) return 0;
  let n = 0;
  for (const t of ta) if (tb.has(t)) n++;
  return n / Math.max(ta.size, tb.size);
}

function containsCore(sumupName: string, catalogName: string) {
  const core = tokens(catalogName).filter((t) => t.length > 2 && !/^\d+$/.test(t));
  const ns = norm(sumupName);
  if (!core.length) return false;
  return core.every((t) => ns.includes(t));
}

const enrich = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, "catalogues/validation-finale/ENRICHISSEMENT_PUBLIC.json"),
    "utf8",
  ),
);

const sumup = loadCsv(
  path.join(ROOT, "inbox_sumup/2026-08-03_16-46-54_items-export_MCGR4RXU.csv"),
);
const mag = loadCsv(path.join(ROOT, "catalogues/catalogue-magasin-all-vaps.csv"));

let refEan: any = null;
const refPath = path.join(ROOT, "data/referentiel/00_EAN.json");
if (fs.existsSync(refPath)) refEan = JSON.parse(fs.readFileSync(refPath, "utf8"));

const yoann = path.join(ROOT, "data/catalog/yoann/allvaps_catalogue.json");
const yoannCat = fs.existsSync(yoann)
  ? JSON.parse(fs.readFileSync(yoann, "utf8"))
  : null;

const out: any[] = [];
let sumupWithBc = 0;
let magWithEan = 0;
let containCoreWithBc = 0;

for (const item of enrich) {
  const name = item.catalogName as string;
  const hits = sumup
    .map((r) => ({
      name: r["Item name"],
      barcode: r.Barcode,
      id: r["Item id (Do not change)"],
      s: nameScore(r["Item name"] || "", name),
      core: containsCore(r["Item name"] || "", name),
    }))
    .filter((x) => x.s >= 0.45 || x.core)
    .sort((a, b) => b.s - a.s)
    .slice(0, 8);

  const magHits = mag
    .map((r) => ({
      name: r.nom_produit,
      ean: r.ean,
      id: r.id_produit,
      s: nameScore(r.nom_produit || "", name),
    }))
    .filter((x) => x.s >= 0.55)
    .sort((a, b) => b.s - a.s)
    .slice(0, 5);

  const coreHits = hits.filter(
    (h) => h.core && h.barcode && /^\d{8,14}$/.test(h.barcode),
  );
  const uniqueCoreBc = [...new Set(coreHits.map((h) => h.barcode))];

  if (hits.some((h) => h.barcode && /^\d{8,14}$/.test(h.barcode))) sumupWithBc++;
  if (magHits.some((h) => h.ean && /^\d{8,14}$/.test(h.ean))) magWithEan++;
  if (uniqueCoreBc.length === 1) containCoreWithBc++;

  // referentiel lookup by product id or name
  let refHit: any = null;
  if (refEan) {
    const arr = Array.isArray(refEan) ? refEan : refEan.items || refEan.eans || [];
    if (Array.isArray(arr)) {
      refHit =
        arr.find(
          (x: any) =>
            x.productId === item.productId ||
            x.id === item.productId ||
            (x.name && nameScore(x.name, name) >= 0.9) ||
            (x.ean && item.ean && x.ean === item.ean),
        ) || null;
    } else if (typeof refEan === "object") {
      refHit = refEan[item.productId] || refEan[name] || null;
    }
  }

  out.push({
    name,
    productId: item.productId,
    enrichEan: item.ean || null,
    eanConfidence: item.eanConfidence || null,
    uniqueCoreBarcode: uniqueCoreBc.length === 1 ? uniqueCoreBc[0] : null,
    uniqueCoreCount: uniqueCoreBc.length,
    sumupTop: hits.slice(0, 4),
    magasinTop: magHits.slice(0, 3),
    refHit,
  });
}

const dest = path.join(ROOT, "catalogues/final-100/rapports/DIAG_EAN_CANDIDATES.json");
fs.writeFileSync(dest, JSON.stringify(out, null, 2));

const uniques = out.filter((o) => o.uniqueCoreBarcode);
console.log(
  JSON.stringify(
    {
      total: out.length,
      sumupWithBarcodeLoose: sumupWithBc,
      magasinWithEan: magWithEan,
      uniqueCoreBarcode: containCoreWithBc,
      samples: uniques.slice(0, 15).map((o) => ({
        name: o.name,
        ean: o.uniqueCoreBarcode,
        top: o.sumupTop[0],
      })),
      refType: refEan
        ? Array.isArray(refEan)
          ? "array"
          : typeof refEan
        : null,
      refKeys: refEan && !Array.isArray(refEan) ? Object.keys(refEan).slice(0, 20) : null,
      yoannType: yoannCat ? typeof yoannCat : null,
    },
    null,
    2,
  ),
);
