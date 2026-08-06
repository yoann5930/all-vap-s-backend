/**
 * Analyse collisions EAN : produits file validation vs détenteurs actuels.
 */
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";

function extractMl(s: string): number | null {
  const m = s.match(/(\d+)\s*ml/i);
  return m ? Number(m[1]) : null;
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
    .filter(
      (t) =>
        t &&
        !["ml", "mg", "by", "e", "liquide", "eliquide", "swoke", "airmust", "hopper"].includes(t),
    )
    .filter((t) => !/^\d+$/.test(t));
}
function flavorMatch(a: string, b: string) {
  const fa = tokens(a);
  if (!fa.length) return 0;
  const nb = norm(b);
  const hit = fa.filter((t) => nb.includes(t)).length;
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

async function main() {
  const prisma = new PrismaClient();
  const enrich = JSON.parse(
    fs.readFileSync("catalogues/validation-finale/ENRICHISSEMENT_PUBLIC.json", "utf8"),
  );
  const sumup = loadCsv("inbox_sumup/2026-08-03_16-46-54_items-export_MCGR4RXU.csv");

  const report: any[] = [];

  for (const item of enrich) {
    const db = await prisma.product.findUnique({
      where: { id: item.productId },
      include: { manufacturer: true, rangeRef: true },
    });
    if (!db) continue;
    const catalogName = item.catalogName || db.name;
    const catalogMl = db.volumeMl || item.formatMl || extractMl(catalogName);

    const candidates = sumup.filter((r) => {
      const n = r["Item name"] || "";
      const cat = r["Category"] || "";
      const ml = extractMl(n) ?? extractMl(cat);
      if (flavorMatch(catalogName, n) < 0.99) return false;
      if (catalogMl != null && ml != null && catalogMl !== ml) return false;
      if (catalogMl != null && ml == null) return false;
      return true;
    });

    const barcodes = [
      ...new Set(candidates.map((c) => c.Barcode).filter((b) => /^\d{8,14}$/.test(b || ""))),
    ];

    const owners: any[] = [];
    for (const bc of barcodes) {
      const o = await prisma.product.findMany({
        where: { barcode: bc },
        select: {
          id: true,
          name: true,
          isActive: true,
          sumupProductId: true,
          manufacturerId: true,
          volumeMl: true,
          imageUrl: true,
          slug: true,
        },
      });
      owners.push({ barcode: bc, owners: o });
    }

    // Also find same-name near duplicates without barcode
    const near = await prisma.product.findMany({
      where: {
        isActive: true,
        NOT: { id: db.id },
        OR: [
          { name: { contains: tokens(catalogName)[0] || "___", mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        barcode: true,
        sumupProductId: true,
        volumeMl: true,
        imageUrl: true,
      },
      take: 20,
    });
    const nearFiltered = near.filter(
      (p) =>
        flavorMatch(catalogName, p.name) >= 0.99 &&
        (catalogMl == null ||
          p.volumeMl == null ||
          p.volumeMl === catalogMl ||
          extractMl(p.name) === catalogMl),
    );

    report.push({
      productId: db.id,
      name: catalogName,
      hasBarcode: Boolean(db.barcode),
      hasSumup: Boolean(db.sumupProductId),
      sumupProductId: db.sumupProductId,
      candidates: candidates.map((c) => ({
        name: c["Item name"],
        barcode: c.Barcode,
        id: c["Item id (Do not change)"],
      })),
      barcodeOwners: owners,
      nearDuplicates: nearFiltered,
      recommendation:
        owners.length === 1 &&
        owners[0].owners.length === 1 &&
        owners[0].owners[0].id !== db.id
          ? "DOUBLON: EAN déjà sur autre fiche — fusionner/désactiver la fiche sans EAN après validation manuelle"
          : barcodes.length === 0
            ? "PAS_EAN_SUMUP"
            : barcodes.length > 1
              ? "MULTI_EAN"
              : owners[0]?.owners?.some((o: any) => o.id === db.id)
                ? "DEJA_OK"
                : "A_ANALYSER",
    });
  }

  const byRec = report.reduce((acc: any, r) => {
    acc[r.recommendation] = (acc[r.recommendation] || 0) + 1;
    return acc;
  }, {});

  fs.writeFileSync(
    "catalogues/final-100/rapports/ANALYSE_DOUBLONS_EAN.json",
    JSON.stringify({ byRec, report }, null, 2),
  );
  console.log(JSON.stringify(byRec, null, 2));
  console.log(
    "samples",
    report
      .filter((r) => r.recommendation === "DOUBLON: EAN déjà sur autre fiche — fusionner/désactiver la fiche sans EAN après validation manuelle")
      .slice(0, 5)
      .map((r) => ({
        name: r.name,
        owner: r.barcodeOwners[0]?.owners[0],
        sumup: r.candidates[0],
      })),
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
