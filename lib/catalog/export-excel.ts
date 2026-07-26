import ExcelJS from "exceljs";
import prisma from "@/lib/prisma";
import { ensureGlobalStockLocation, GLOBAL_STOCK_CODE, GLOBAL_STOCK_NAME } from "@/lib/catalog/stock";

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true };
}

function addSheet(
  wb: ExcelJS.Workbook,
  name: string,
  headers: string[],
  rows: Array<Array<string | number | boolean | Date | null | undefined>>
) {
  const sheet = wb.addWorksheet(name.slice(0, 31));
  sheet.addRow(headers);
  styleHeader(sheet.getRow(1));
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  for (const r of rows) sheet.addRow(r.map((v) => (v == null ? "" : v)));
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length },
  };
  return sheet;
}

/** Génère CATALOGUE_STOCK_ALL_VAPS.xlsx — stock général unique uniquement. */
export async function generateCatalogStockWorkbook(): Promise<Buffer> {
  await ensureGlobalStockLocation();

  const [products, variants, globalStock, matches, syncRuns, syncErrors] = await Promise.all([
    prisma.product.findMany({ orderBy: { name: "asc" }, include: { flavors: true } }),
    prisma.productVariant.findMany({ orderBy: { name: "asc" } }),
    prisma.stockLevel.findMany({
      where: { location: { code: GLOBAL_STOCK_CODE } },
      include: { product: true, variant: true, location: true },
    }),
    prisma.productMatch.findMany({ orderBy: { createdAt: "desc" }, take: 5000 }),
    prisma.syncRun.findMany({ orderBy: { startedAt: "desc" }, take: 200 }),
    prisma.syncError.findMany({ orderBy: { createdAt: "desc" }, take: 2000 }),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "All Vap's";
  wb.created = new Date();

  addSheet(
    wb,
    "Catalogue_Produits",
    [
      "id", "sku", "barcode", "name", "normalizedName", "brand", "range", "category",
      "productType", "priceCents", "currency", "source", "active", "visibleOnline",
      "sumupProductId", "legacyStock",
    ],
    products.map((p) => [
      p.id, p.sku, p.barcode, p.name, p.normalizedName, p.brand, p.range, p.category,
      p.productType, p.priceCents, p.currency, p.source, p.isActive, p.visibleOnline,
      p.sumupProductId, p.stock,
    ])
  );

  addSheet(
    wb,
    "Variantes",
    [
      "id", "productId", "name", "sku", "barcode", "nicotineMg", "capacityMl",
      "resistanceOhms", "powerWatts", "color", "sumupVariantId", "active",
    ],
    variants.map((v) => [
      v.id, v.productId, v.name, v.sku, v.barcode, v.nicotineMg, v.capacityMl,
      v.resistanceOhms, v.powerWatts, v.color, v.sumupVariantId, v.active,
    ])
  );

  addSheet(
    wb,
    "Stock_General_All_Vaps",
    [
      "productId", "productName", "variantId", "variantName", "quantity",
      "reservedQuantity", "availableQuantity", "lowStockThreshold", "source", "lastSyncedAt",
      "locationCode", "locationName",
    ],
    globalStock.map((s) => [
      s.productId, s.product.name, s.variantId, s.variant.name, s.quantity,
      s.reservedQuantity, s.availableQuantity, s.lowStockThreshold, s.source, s.lastSyncedAt,
      GLOBAL_STOCK_CODE, GLOBAL_STOCK_NAME,
    ])
  );

  addSheet(
    wb,
    "Import_SumUp",
    ["syncRunId", "source", "locationCode", "dryRun", "status", "startedAt", "completedAt"],
    syncRuns
      .filter((r) => r.source === "sumup_csv")
      .map((r) => [r.id, r.source, r.locationCode, r.dryRun, r.status, r.startedAt, r.completedAt])
  );

  addSheet(
    wb,
    "Import_Stock",
    ["note"],
    [["Recalage stock général via CSV SumUp — source officielle des quantités physiques"]]
  );

  addSheet(
    wb,
    "Correspondances",
    [
      "id", "sourceName", "normalizedSourceName", "matchedProductId", "matchMethod",
      "confidenceScore", "status", "syncRunId",
    ],
    matches.map((m) => [
      m.id, m.sourceName, m.normalizedSourceName, m.matchedProductId, m.matchMethod,
      m.confidenceScore, m.status, m.syncRunId,
    ])
  );

  addSheet(
    wb,
    "Produits_Non_Reconnus",
    ["id", "sourceName", "normalizedSourceName", "confidenceScore", "createdAt"],
    matches
      .filter((m) => m.status === "UNMATCHED")
      .map((m) => [m.id, m.sourceName, m.normalizedSourceName, m.confidenceScore, m.createdAt])
  );

  addSheet(
    wb,
    "Doublons_Potentiels",
    ["id", "sourceName", "normalizedSourceName", "status", "createdAt"],
    matches
      .filter((m) => m.status === "DUPLICATE" || m.status === "REVIEW")
      .map((m) => [m.id, m.sourceName, m.normalizedSourceName, m.status, m.createdAt])
  );

  addSheet(
    wb,
    "Erreurs_Import",
    ["id", "syncRunId", "sourceRow", "errorType", "errorMessage", "resolved", "createdAt"],
    syncErrors.map((e) => [e.id, e.syncRunId, e.sourceRow, e.errorType, e.errorMessage, e.resolved, e.createdAt])
  );

  addSheet(
    wb,
    "Historique_Synchronisations",
    [
      "id", "source", "locationCode", "dryRun", "status", "importedCount", "updatedCount",
      "createCount", "unmatchedCount", "duplicateCount", "errorCount", "startedAt", "completedAt",
    ],
    syncRuns.map((r) => [
      r.id, r.source, r.locationCode, r.dryRun, r.status, r.importedCount, r.updatedCount,
      r.createCount, r.unmatchedCount, r.duplicateCount, r.errorCount, r.startedAt, r.completedAt,
    ])
  );

  addSheet(
    wb,
    "Tableau_Croise_Stocks",
    ["productId", "productName", "quantity", "reservedQuantity", "availableQuantity", "statusHint"],
    globalStock.map((s) => [
      s.productId,
      s.product.name,
      s.quantity,
      s.reservedQuantity,
      s.availableQuantity,
      s.availableQuantity <= 0 ? "RUPTURE" : s.availableQuantity <= s.lowStockThreshold ? "STOCK_FAIBLE" : "EN_STOCK",
    ])
  );

  const byBrand = new Map<string, number>();
  for (const p of products) {
    const key = p.brand || "(sans marque)";
    byBrand.set(key, (byBrand.get(key) ?? 0) + 1);
  }
  addSheet(
    wb,
    "Tableau_Croise_Marques",
    ["brand", "productCount"],
    [...byBrand.entries()].map(([brand, productCount]) => [brand, productCount])
  );

  const byFlavor = new Map<string, number>();
  for (const p of products) {
    for (const f of p.flavors) {
      const key = f.flavorFamily || f.primaryFlavor || "(non renseigné)";
      byFlavor.set(key, (byFlavor.get(key) ?? 0) + 1);
    }
  }
  if (byFlavor.size === 0) byFlavor.set("(aucune donnée goût)", 0);
  addSheet(
    wb,
    "Tableau_Croise_Gouts",
    ["flavor", "count"],
    [...byFlavor.entries()].map(([flavor, count]) => [flavor, count])
  );

  const byCat = new Map<string, number>();
  for (const p of products) {
    byCat.set(p.category, (byCat.get(p.category) ?? 0) + 1);
  }
  addSheet(
    wb,
    "Tableau_Croise_Categories",
    ["category", "productCount"],
    [...byCat.entries()].map(([category, productCount]) => [category, productCount])
  );

  addSheet(
    wb,
    "Parametres",
    ["key", "value"],
    [
      ["generatedAt", new Date().toISOString()],
      ["stockLocation", GLOBAL_STOCK_CODE],
      ["stockName", GLOBAL_STOCK_NAME],
      ["rule", "Un seul stock général — pas de stock par boutique"],
      ["file", "CATALOGUE_STOCK_ALL_VAPS.xlsx"],
      ["note", "Fichier de contrôle — PostgreSQL reste la base centrale"],
    ]
  );

  // Garde-fou : aucune feuille boutique
  for (const forbidden of ["Stocks_Hautmont", "Stocks_Le_Quesnoy", "HAUTMONT", "LE_QUESNOY"]) {
    if (wb.getWorksheet(forbidden)) {
      throw new Error(`Feuille interdite détectée: ${forbidden}`);
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
