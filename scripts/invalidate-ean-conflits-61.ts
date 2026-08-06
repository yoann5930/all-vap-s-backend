/**
 * Invalide EAN conflictuels / contaminés issus du scrape HTML (produits liés).
 */
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";

const OUT = path.join(process.cwd(), "catalogues", "validation-finale");
const FILE = path.join(OUT, "ENRICHISSEMENT_PUBLIC.json");

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
  const results: any[] = JSON.parse(fs.readFileSync(FILE, "utf8"));

  // Detect shared EANs
  const byEan = new Map<string, string[]>();
  for (const r of results) {
    if (!r.ean) continue;
    byEan.set(r.ean, [...(byEan.get(r.ean) || []), r.catalogName]);
  }

  const invalidate = new Set<string>();
  for (const [ean, names] of byEan) {
    if (names.length > 1) {
      for (const n of names) invalidate.add(n);
      console.log("SHARED EAN", ean, names);
    }
  }
  // Invalidate HTML-scraped EANs that are not from airmust URL or curated retailer with explicit match
  for (const r of results) {
    if (!r.ean) continue;
    const src = String(r.eanSource || "");
    const safe =
      src.includes("airmust.com") ||
      (r.catalogName.includes("Mûre Cassis") && r.ean === "3662572325935") ||
      src === "ean-existant-non-modifie";
    if (!safe && r.eanConfidence !== "existing") {
      invalidate.add(r.catalogName);
    }
  }

  for (const r of results) {
    if (invalidate.has(r.catalogName) && r.ean) {
      r.notes = [...(r.notes || []), `EAN ${r.ean} invalidé (conflit ou bruit page liée)`];
      r.ean = null;
      r.eanConfidence = "conflict";
      r.eanSource = null;
      r.missingFields = Array.from(new Set([...(r.missingFields || []), "ean"]));
      r.stillNeedsHumanValidation = true;
      const folder = path.join(OUT, slugify(r.catalogName));
      if (fs.existsSync(folder)) {
        fs.writeFileSync(path.join(folder, "ean.txt"), "");
        fs.writeFileSync(path.join(folder, "fiche.json"), JSON.stringify(r, null, 2));
        fs.writeFileSync(
          path.join(folder, "raison-blocage.txt"),
          `Manque encore: ${(r.missingFields || []).join(", ")}`,
        );
      }
      fs.writeFileSync(
        path.join(OUT, "fiches-completes-publiques", `${slugify(r.catalogName)}.json`),
        JSON.stringify(r, null, 2),
      );
    }
  }

  const still = results.filter(
    (r) =>
      r.stillNeedsHumanValidation ||
      (r.missingFields || []).some((m: string) =>
        ["ean", "photo", "nicotine", "format", "pgVg"].includes(m),
      ),
  );

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("A valider");
  ws.columns = [
    { header: "Fabricant", key: "m", width: 16 },
    { header: "Gamme", key: "g", width: 18 },
    { header: "Produit", key: "p", width: 30 },
    { header: "Format", key: "f", width: 10 },
    { header: "Nicotine trouvée", key: "n", width: 28 },
    { header: "PG/VG", key: "pg", width: 12 },
    { header: "EAN", key: "ean", width: 16 },
    { header: "Photo", key: "ph", width: 8 },
    { header: "Éléments impossibles publiquement", key: "miss", width: 36 },
    { header: "Commentaire", key: "c", width: 50 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const r of still) {
    const impossible = (r.missingFields || []).filter((m: string) =>
      ["ean", "photo", "nicotine", "format", "pgVg", "description"].includes(m),
    );
    const row = ws.addRow({
      m: r.manufacturer,
      g: r.range,
      p: r.catalogName,
      f: r.formatMl ? `${r.formatMl} ml` : "",
      n: r.nicotine || "",
      pg: r.pgVg || "",
      ean: r.ean || "",
      ph: r.photoLocal ? "Oui" : "Non",
      miss: impossible.join(", "),
      c: impossible.includes("ean")
        ? "EAN non trouvé de façon univoque sur sources publiques"
        : `Manque: ${impossible.join(", ")}`,
    });
    row.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFF6B6B" },
      };
    });
  }
  await wb.xlsx.writeFile(path.join(OUT, "PRODUITS_A_VALIDER.xlsx"));

  const fully = results.filter((r) => !(r.missingFields || []).length);
  const reportPath = path.join(OUT, "FINAL_ALL_VAPS_COMPLET.md");
  let report = fs.readFileSync(reportPath, "utf8");
  // Append correction note
  report += `\n\n## Correction post-audit EAN\n\nEAN conflictuels invalidés : **${invalidate.size}** produit(s).\nFiches 100 % complètes après correction : **${fully.length}**.\nLignes \`PRODUITS_A_VALIDER.xlsx\` : **${still.length}**.\n`;
  fs.writeFileSync(reportPath, report);
  fs.writeFileSync(path.join(process.cwd(), "catalogues", "FINAL_ALL_VAPS_COMPLET.md"), report);
  fs.writeFileSync(FILE, JSON.stringify(results, null, 2));

  console.log(
    JSON.stringify(
      {
        invalidated: [...invalidate],
        fullyPublic: fully.length,
        still: still.length,
        fullyNames: fully.map((r) => r.catalogName + " " + r.ean),
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
