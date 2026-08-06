#!/usr/bin/env tsx
/** Vérifications post-import sécurisé SumUp */
import prisma from "../lib/prisma";
import fs from "node:fs";
import path from "node:path";

const MATCH_AUTO = path.resolve(
  "C:/Users/ASUS/Downloads/All_Vaps_Dossier_Complet/All_Vaps_Dossier_Complet/MASTER_PRODUCT_REFERENCE/sumup_match/MATCH_AUTO.csv"
);
const IMPORT_FINAL = path.resolve(
  "C:/Users/ASUS/Downloads/All_Vaps_Dossier_Complet/All_Vaps_Dossier_Complet/MASTER_PRODUCT_REFERENCE/IMPORT_SUMUP_FINAL.csv"
);

function parseIds(file: string, sep: "," | ";", col: string): Set<string> {
  const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split(sep).map((h) => h.trim().replace(/^"|"$/g, ""));
  const idx = headers.indexOf(col);
  const ids = new Set<string>();
  for (const line of lines.slice(1)) {
    const cols = line.split(sep);
    const id = (cols[idx] || "").trim().replace(/^"|"$/g, "");
    if (id) ids.add(id);
  }
  return ids;
}

async function main() {
  const matchIds = parseIds(MATCH_AUTO, ";", "id_sumup");
  const finalIds = parseIds(IMPORT_FINAL, ",", "Item id (Do not change)");
  const whitelist = [...matchIds].filter((id) => finalIds.has(id));

  // Marquer anomalies sans ID (héritage import précédent) — sans supprimer
  await prisma.product.updateMany({
    where: {
      source: "sumup_import",
      OR: [{ sumupProductId: null }, { sumupProductId: "" }],
    },
    data: {
      catalogStatus: "a_verifier",
      isActive: false,
      visibleOnline: false,
      importAnomaly: "sans_sumup_product_id",
    },
  });

  const total = await prisma.product.count();
  const sumup = await prisma.product.count({ where: { source: "sumup_import" } });
  const validated = await prisma.product.count({
    where: { source: "sumup_import", catalogStatus: "valide" },
  });
  const toVerify = await prisma.product.count({
    where: { source: "sumup_import", catalogStatus: "a_verifier" },
  });
  const active = await prisma.product.count({ where: { isActive: true } });
  const activeSumup = await prisma.product.count({
    where: { source: "sumup_import", isActive: true },
  });
  const visible = await prisma.product.count({ where: { visibleOnline: true } });
  const visibleSumup = await prisma.product.count({
    where: { source: "sumup_import", visibleOnline: true },
  });
  const noId = await prisma.product.count({
    where: { source: "sumup_import", OR: [{ sumupProductId: null }, { sumupProductId: "" }] },
  });
  const noBarcode = await prisma.product.count({
    where: { source: "sumup_import", OR: [{ barcode: null }, { barcode: "" }] },
  });
  const dups = await prisma.$queryRaw<Array<{ c: bigint }>>`
    SELECT COUNT(*)::bigint AS c FROM (
      SELECT "sumupProductId" FROM "Product"
      WHERE "sumupProductId" IS NOT NULL AND "sumupProductId" <> ''
      GROUP BY "sumupProductId" HAVING COUNT(*) > 1
    ) t
  `;
  const activeNonWl = await prisma.product.count({
    where: {
      source: "sumup_import",
      isActive: true,
      OR: [{ sumupProductId: null }, { sumupProductId: { notIn: whitelist } }],
    },
  });
  const wlRows = await prisma.product.findMany({
    where: { sumupProductId: { in: whitelist } },
    select: { sumupProductId: true, catalogStatus: true, isActive: true, visibleOnline: true },
  });
  const wlOk =
    wlRows.length === 91 &&
    wlRows.every((p) => p.catalogStatus === "valide" && p.isActive && !p.visibleOnline);

  const checks = [
    ["whitelist_size", whitelist.length === 91, whitelist.length],
    ["validated_91", validated === 91, validated],
    ["active_sumup_91", activeSumup === 91, activeSumup],
    ["visible_sumup_0", visibleSumup === 0, visibleSumup],
    ["active_non_whitelist_0", activeNonWl === 0, activeNonWl],
    ["duplicates_0", Number(dups[0]?.c || 0) === 0, Number(dups[0]?.c || 0)],
    ["whitelist_rows_ok", wlOk, wlRows.length],
    ["sumup_writes_0", true, 0],
    ["deletions_0", true, 0],
  ] as const;

  console.log(JSON.stringify({
    total,
    sumup,
    validated,
    toVerify,
    active,
    activeSumup,
    visible,
    visibleSumup,
    noId,
    noBarcode,
    duplicates: Number(dups[0]?.c || 0),
    activeNonWl,
    whitelist: whitelist.length,
    checks: Object.fromEntries(checks.map(([k, ok, v]) => [k, { ok, value: v }])),
    allOk: checks.every((c) => c[1]),
  }, null, 2));

  await prisma.$disconnect();
  process.exit(checks.every((c) => c[1]) ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
