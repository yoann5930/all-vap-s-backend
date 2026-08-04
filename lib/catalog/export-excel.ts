import ExcelJS from "exceljs";
import prisma from "@/lib/prisma";
import {
  HAUTMONT_STOCK_CODE,
  LE_QUESNOY_STOCK_CODE,
  stockCodeDisplayName,
} from "@/lib/catalog/normalize";
import { ensureStoreStockLocations } from "@/lib/catalog/stock";

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

function stockRows(
  levels: Array<{
    productId: string;
    product: { name: string };
    variantId: string;
    variant: { name: string };
    quantity: number;
    reservedQuantity: number;
    availableQuantity: number;
    lowStockThreshold: number;
    source: string;
    lastSyncedAt: Date | null;
    location: { code: string; name: string };
  }>
) {
  return levels.map((s) => [
    s.productId,
    s.product.name,
    s.variantId,
    s.variant.name,
    s.quantity,
    s.reservedQuantity,
    s.availableQuantity,
    s.lowStockThreshold,
    s.source,
    s.lastSyncedAt,
    s.location.code,
    s.location.name,
  ]);
}

/** Génère CATALOGUE_STOCK_ALL_VAPS.xlsx — stocks Hautmont / Le Quesnoy + global calculé. */
export async function generateCatalogStockWorkbook(): Promise<Buffer> {
  await ensureStoreStockLocations();

  const [products, variants, storeStock, matches, syncRuns, syncErrors] = await Promise.all([
    prisma.product.findMany({ orderBy: { name: "asc" }, include: { flavors: true } }),
    prisma.productVariant.findMany({ orderBy: { name: "asc" } }),
    prisma.stockLevel.findMany({
      where: { location: { code: { in: [HAUTMONT_STOCK_CODE, LE_QUESNOY_STOCK_CODE] } } },
      include: { product: true, variant: true, location: true },
    }),
    prisma.productMatch.findMany({ orderBy: { createdAt: "desc" }, take: 5000 }),
    prisma.syncRun.findMany({ orderBy: { startedAt: "desc" }, take: 200 }),
    prisma.syncError.findMany({ orderBy: { createdAt: "desc" }, take: 2000 }),
  ]);

  const hautmont = storeStock.filter((s) => s.location.code === HAUTMONT_STOCK_CODE);
  const leQuesnoy = storeStock.filter((s) => s.location.code === LE_QUESNOY_STOCK_CODE);

  const byProduct = new Map<
    string,
    { name: string; hautmont: number; leQuesnoy: number; reservedH: number; reservedQ: number }
  >();
  for (const p of products) {
    byProduct.set(p.id, {
      name: p.name,
      hautmont: 0,
      leQuesnoy: 0,
      reservedH: 0,
      reservedQ: 0,
    });
  }
  for (const s of hautmont) {
    const row = byProduct.get(s.productId) ?? {
      name: s.product.name,
      hautmont: 0,
      leQuesnoy: 0,
      reservedH: 0,
      reservedQ: 0,
    };
    row.hautmont += s.quantity;
    row.reservedH += s.reservedQuantity;
    byProduct.set(s.productId, row);
  }
  for (const s of leQuesnoy) {
    const row = byProduct.get(s.productId) ?? {
      name: s.product.name,
      hautmont: 0,
      leQuesnoy: 0,
      reservedH: 0,
      reservedQ: 0,
    };
    row.leQuesnoy += s.quantity;
    row.reservedQ += s.reservedQuantity;
    byProduct.set(s.productId, row);
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "All Vap's";
  wb.created = new Date();

  const stockHeaders = [
    "productId",
    "productName",
    "variantId",
    "variantName",
    "quantity",
    "reservedQuantity",
    "availableQuantity",
    "lowStockThreshold",
    "source",
    "lastSyncedAt",
    "locationCode",
    "locationName",
  ];

  addSheet(
    wb,
    "Catalogue_Produits",
    [
      "id",
      "sku",
      "barcode",
      "name",
      "normalizedName",
      "brand",
      "range",
      "category",
      "productType",
      "priceCents",
      "currency",
      "source",
      "active",
      "visibleOnline",
      "sumupProductId",
      "stockGlobalCalcule",
    ],
    products.map((p) => [
      p.id,
      p.sku,
      p.barcode,
      p.name,
      p.normalizedName,
      p.brand,
      p.range,
      p.category,
      p.productType,
      p.priceCents,
      p.currency,
      p.source,
      p.isActive,
      p.visibleOnline,
      p.sumupProductId,
      p.stock,
    ])
  );

  addSheet(
    wb,
    "Variantes",
    [
      "id",
      "productId",
      "name",
      "sku",
      "barcode",
      "nicotineMg",
      "capacityMl",
      "resistanceOhms",
      "powerWatts",
      "color",
      "sumupVariantId",
      "active",
    ],
    variants.map((v) => [
      v.id,
      v.productId,
      v.name,
      v.sku,
      v.barcode,
      v.nicotineMg,
      v.capacityMl,
      v.resistanceOhms,
      v.powerWatts,
      v.color,
      v.sumupVariantId,
      v.active,
    ])
  );

  addSheet(wb, "Stocks_Hautmont", stockHeaders, stockRows(hautmont));
  addSheet(wb, "Stocks_Le_Quesnoy", stockHeaders, stockRows(leQuesnoy));

  addSheet(
    wb,
    "Stocks_Global_Calcule",
    [
      "productId",
      "productName",
      "stockHautmont",
      "stockLeQuesnoy",
      "stockGlobal",
      "reservedHautmont",
      "reservedLeQuesnoy",
      "availableGlobal",
    ],
    [...byProduct.entries()].map(([productId, row]) => [
      productId,
      row.name,
      row.hautmont,
      row.leQuesnoy,
      row.hautmont + row.leQuesnoy,
      row.reservedH,
      row.reservedQ,
      Math.max(0, row.hautmont + row.leQuesnoy - row.reservedH - row.reservedQ),
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
    [
      [
        "Recalage stock boutique via CSV SumUp — choisir HAUTMONT ou LE_QUESNOY à l'import. Global = somme calculée.",
      ],
    ]
  );

  addSheet(
    wb,
    "Correspondances",
    [
      "id",
      "sourceName",
      "normalizedSourceName",
      "matchedProductId",
      "matchMethod",
      "confidenceScore",
      "status",
      "syncRunId",
    ],
    matches.map((m) => [
      m.id,
      m.sourceName,
      m.normalizedSourceName,
      m.matchedProductId,
      m.matchMethod,
      m.confidenceScore,
      m.status,
      m.syncRunId,
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
    syncErrors.map((e) => [
      e.id,
      e.syncRunId,
      e.sourceRow,
      e.errorType,
      e.errorMessage,
      e.resolved,
      e.createdAt,
    ])
  );

  addSheet(
    wb,
    "Historique_Synchronisations",
    [
      "id",
      "source",
      "locationCode",
      "dryRun",
      "status",
      "importedCount",
      "updatedCount",
      "createCount",
      "unmatchedCount",
      "duplicateCount",
      "errorCount",
      "startedAt",
      "completedAt",
    ],
    syncRuns.map((r) => [
      r.id,
      r.source,
      r.locationCode,
      r.dryRun,
      r.status,
      r.importedCount,
      r.updatedCount,
      r.createCount,
      r.unmatchedCount,
      r.duplicateCount,
      r.errorCount,
      r.startedAt,
      r.completedAt,
    ])
  );

  addSheet(
    wb,
    "Parametres",
    ["key", "value"],
    [
      ["generatedAt", new Date().toISOString()],
      ["stockHautmont", HAUTMONT_STOCK_CODE],
      ["stockLeQuesnoy", LE_QUESNOY_STOCK_CODE],
      ["stockHautmontName", stockCodeDisplayName(HAUTMONT_STOCK_CODE)],
      ["stockLeQuesnoyName", stockCodeDisplayName(LE_QUESNOY_STOCK_CODE)],
      ["rule", "Deux stocks indépendants — global = somme calculée"],
      ["file", "CATALOGUE_STOCK_ALL_VAPS.xlsx"],
      ["note", "Fichier de contrôle — PostgreSQL reste la base centrale"],
    ]
  );

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
