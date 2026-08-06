import fs from "node:fs";

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
    .filter(
      (t) =>
        t &&
        !["ml", "mg", "by", "e", "liquide", "eliquide", "swoke", "airmust", "hopper"].includes(t),
    );
}
function extractMl(s: string): number | null {
  const m = s.match(/(\d+)\s*ml/i);
  return m ? Number(m[1]) : null;
}
function flavorCore(name: string) {
  return tokens(name).filter((t) => !/^\d+$/.test(t));
}
function flavorMatch(a: string, b: string) {
  const fa = flavorCore(a);
  const fb = flavorCore(b);
  if (!fa.length || !fb.length) return 0;
  const setB = new Set(fb);
  const hit = fa.filter((t) => setB.has(t) || norm(b).includes(t)).length;
  return hit / fa.length;
}

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
  const raw = fs.readFileSync(file, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.length);
  const headers = parseDelimited(lines[0], ",").map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  let buf = "";
  for (let i = 1; i < lines.length; i++) {
    buf += (buf ? "\n" : "") + lines[i];
    if (((buf.match(/"/g) || []).length) % 2) continue;
    const cols = parseDelimited(buf, ",");
    buf = "";
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] || "").replace(/^\t/, "").trim();
    });
    rows.push(row);
  }
  return rows;
}

const enrich = JSON.parse(
  fs.readFileSync("catalogues/validation-finale/ENRICHISSEMENT_PUBLIC.json", "utf8"),
);
const sumup = loadCsv("inbox_sumup/2026-08-03_16-46-54_items-export_MCGR4RXU.csv");

const samples = [
  "Aspik 60 ml",
  "Greensound 200 ml",
  "Café Caramel 50 ml",
  "Bisou Pink 50 ml",
  "Bluevolt 200 ml",
  "Mûre Cassis 50 ml",
];

for (const name of samples) {
  const catalogMl = extractMl(name);
  const candidates = sumup
    .map((r) => {
      const n = r["Item name"] || "";
      const cat = r["Category"] || "";
      const ml = extractMl(n) ?? extractMl(cat);
      const fm = flavorMatch(name, n);
      return { n, cat, ml, fm, bc: r.Barcode };
    })
    .filter((x) => x.fm >= 0.5)
    .sort((a, b) => b.fm - a.fm)
    .slice(0, 5);

  const strict = candidates.filter((x) => {
    if (x.fm < 0.99) return false;
    if (catalogMl != null && x.ml != null && catalogMl !== x.ml) return false;
    if (catalogMl != null && x.ml == null) return false;
    return true;
  });

  console.log("\n===", name, "catalogMl", catalogMl);
  console.log("top:", candidates);
  console.log("strict:", strict);
}
