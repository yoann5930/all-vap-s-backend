/**
 * Enrichit les CSV Liquidarom (slugs, imageUrl, statuts) + génère CORRESPONDANCE_LIQUIDAROM.json
 * Usage: npx tsx scripts/enrich-liquidarom-csv.ts
 */
import fs from "node:fs";
import path from "node:path";
import { parseSemicolonCsv } from "../lib/catalog/liquidarom-import";
import {
  buildCorrespondence,
  productFlavorSlug,
  productPublicImagePath,
  resolveOfficialName,
} from "../lib/catalog/liquidarom-meta";

function escapeCell(v: string): string {
  if (/[;"\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function toCsv(headers: string[], rows: Record<string, string>[]): string {
  const lines = [headers.join(";")];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCell(row[h] ?? "")).join(";"));
  }
  return lines.join("\n") + "\n";
}

async function main() {
  const base = path.join(process.cwd(), "data", "liquidarom");
  const workBase = path.join("D:/all vaps", "ALLVAPS_LIQUIDAROM_OFFICIAL_IMAGES");
  const productsPath = path.join(base, "All_Vaps_Produits_Magasin_MAJ_Liquidarom.csv");
  const rows = parseSemicolonCsv(fs.readFileSync(productsPath, "utf8"));
  const correspondence = rows.map(buildCorrespondence);

  const extraHeaders = [
    "reference",
    "slug",
    "fabricant",
    "gamme",
    "nom officiel",
    "nom affiché",
    "imageUrl",
    "imageStatus",
    "imageSource",
    "verifiedAt",
    "productStatus",
    "visibility",
  ];

  const enriched = rows.map((row) => {
    const ref = row["ID produit"];
    const range = row["Sous-catégorie"] || "";
    const officialName = resolveOfficialName(ref, row["Nom commercial"]);
    const slug = productFlavorSlug(officialName);
    const imagePath = productPublicImagePath({ range, commercialName: officialName });
    const abs = path.join(process.cwd(), "public", imagePath.replace(/^\//, "").replace(/\//g, path.sep));
    const hasImage = fs.existsSync(abs);
    const corr = correspondence.find((c) => c.internalReference === ref)!;

    return {
      ...row,
      reference: ref,
      slug,
      fabricant: "Liquidarom",
      gamme: range,
      "nom officiel": officialName,
      "nom affiché": row["Nom commercial"],
      imageUrl: hasImage ? imagePath : "",
      imageStatus: hasImage ? "official" : "pending",
      imageSource: hasImage ? "https://www.liquidarom.com/" : "",
      verifiedAt: hasImage ? new Date().toISOString().slice(0, 10) : "",
      productStatus: corr.imageStatus,
      visibility: row["Actif en ligne"] || "Non",
    };
  });

  const headers = [...Object.keys(rows[0] || {}), ...extraHeaders.filter((h) => !(rows[0] && h in rows[0]))];
  const csvOut = toCsv(headers, enriched);
  fs.writeFileSync(productsPath, csvOut, "utf8");
  if (fs.existsSync(workBase)) {
    fs.writeFileSync(path.join(workBase, "All_Vaps_Produits_Magasin_MAJ_Liquidarom.csv"), csvOut, "utf8");
  }

  const corrPath = path.join(base, "CORRESPONDANCE_LIQUIDAROM.json");
  fs.writeFileSync(corrPath, JSON.stringify(correspondence, null, 2), "utf8");
  if (fs.existsSync(workBase)) {
    fs.writeFileSync(path.join(workBase, "CORRESPONDANCE_LIQUIDAROM.json"), JSON.stringify(correspondence, null, 2), "utf8");
  }

  console.log(
    JSON.stringify(
      {
        enrichedProducts: enriched.length,
        withLocalImage: enriched.filter((r) => r.imageUrl).length,
        pendingImages: enriched.filter((r) => !r.imageUrl).length,
        correspondencePath: corrPath,
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
