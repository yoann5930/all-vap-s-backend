import { google } from "googleapis";
import prisma from "@/lib/prisma";
import { getSheetsAuth } from "@/lib/google/auth";
import { getGoogleSheetsSpreadsheetId, isSheetsConfigured } from "@/lib/google/config";
import { ensureStoreStockLocations, getDualStockForProduct } from "@/lib/catalog/stock";

export type SheetsSyncResult =
  | { ok: true; spreadsheetId: string; sheets: string[] }
  | { ok: false; code: "GOOGLE_NOT_CONFIGURED" | "SYNC_FAILED"; message: string };

async function ensureSheet(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  title: string
) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = meta.data.sheets?.find((s) => s.properties?.title === title);
  if (existing) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title } } }] },
  });
}

async function writeSheet(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  title: string,
  values: string[][]
) {
  await ensureSheet(sheets, spreadsheetId, title);
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${title}!A:ZZ`,
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${title}!A1`,
    valueInputOption: "RAW",
    requestBody: { values },
  });
}

/**
 * Synchronise Produits, Gammes, Tarifs, Stocks, Historique vers Google Sheets.
 * Prix = prix produits existants (pas d'invention « 1 gamme = 1 prix »).
 */
export async function syncCatalogToGoogleSheets(): Promise<SheetsSyncResult> {
  if (!isSheetsConfigured()) {
    console.info("[google/sheets] skip — non configuré");
    return {
      ok: false,
      code: "GOOGLE_NOT_CONFIGURED",
      message: "Google Sheets non configuré — synchronisation désactivée.",
    };
  }

  const authResult = getSheetsAuth();
  if (!authResult.ok) {
    return { ok: false, code: authResult.code, message: authResult.message };
  }

  try {
    await ensureStoreStockLocations();
    const spreadsheetId = getGoogleSheetsSpreadsheetId();
    const sheetsApi = google.sheets({ version: "v4", auth: authResult.auth });

    const products = await prisma.product.findMany({ orderBy: { name: "asc" } });
    const inventoryLines = await prisma.inventoryLine.findMany({
      include: { session: { include: { location: true } }, product: true },
      orderBy: { createdAt: "desc" },
      take: 2000,
    });

    const produits: string[][] = [
      ["id", "sku", "barcode", "name", "brand", "range", "category", "active", "visibleOnline"],
      ...products.map((p) => [
        p.id,
        p.sku || "",
        p.barcode || "",
        p.name,
        p.brand || "",
        p.range || "",
        p.category,
        String(p.isActive),
        String(p.visibleOnline),
      ]),
    ];

    const gammesMap = new Map<string, { brand: string; count: number }>();
    for (const p of products) {
      if (!p.range) continue;
      const key = `${p.brand || ""}||${p.range}`;
      const cur = gammesMap.get(key) || { brand: p.brand || "", count: 0 };
      cur.count += 1;
      gammesMap.set(key, cur);
    }
    const gammes: string[][] = [
      ["brand", "range", "productCount"],
      ...[...gammesMap.entries()].map(([key, v]) => {
        const range = key.split("||")[1] || "";
        return [v.brand, range, String(v.count)];
      }),
    ];

    // Tarifs : prix existants par produit (jamais inventés / jamais écrasés)
    const tarifs: string[][] = [
      ["productId", "name", "range", "priceCents", "promoPriceCents", "currency"],
      ...products.map((p) => [
        p.id,
        p.name,
        p.range || "",
        String(p.priceCents),
        p.promoPriceCents != null ? String(p.promoPriceCents) : "",
        p.currency,
      ]),
    ];

    const stocksHautmont: string[][] = [
      ["productId", "name", "quantity", "reserved", "available"],
    ];
    const stocksLeQuesnoy: string[][] = [
      ["productId", "name", "quantity", "reserved", "available"],
    ];
    const stocksGlobal: string[][] = [
      ["productId", "name", "hautmont", "leQuesnoy", "global"],
    ];

    for (const p of products) {
      const dual = await getDualStockForProduct(p.id);
      stocksHautmont.push([
        p.id,
        p.name,
        String(dual.hautmont.quantity),
        String(dual.hautmont.reservedQuantity),
        String(dual.hautmont.availableQuantity),
      ]);
      stocksLeQuesnoy.push([
        p.id,
        p.name,
        String(dual.leQuesnoy.quantity),
        String(dual.leQuesnoy.reservedQuantity),
        String(dual.leQuesnoy.availableQuantity),
      ]);
      stocksGlobal.push([
        p.id,
        p.name,
        String(dual.hautmont.quantity),
        String(dual.leQuesnoy.quantity),
        String(dual.global.quantity),
      ]);
    }

    const historique: string[][] = [
      [
        "lineId",
        "sessionId",
        "employeeName",
        "locationCode",
        "barcode",
        "productId",
        "productName",
        "quantityCounted",
        "photoPath",
        "driveFileId",
        "createdAt",
      ],
      ...inventoryLines.map((l) => [
        l.id,
        l.sessionId,
        l.session.employeeName,
        l.session.location.code,
        l.barcode || "",
        l.productId || "",
        l.product?.name || "",
        String(l.quantityCounted),
        l.photoPath || "",
        l.driveFileId || "",
        l.createdAt.toISOString(),
      ]),
    ];

    const written = [
      "Produits",
      "Gammes",
      "Tarifs",
      "Stocks_Hautmont",
      "Stocks_Le_Quesnoy",
      "Stocks_Global_Calcule",
      "Historique",
    ];

    await writeSheet(sheetsApi, spreadsheetId, "Produits", produits);
    await writeSheet(sheetsApi, spreadsheetId, "Gammes", gammes);
    await writeSheet(sheetsApi, spreadsheetId, "Tarifs", tarifs);
    await writeSheet(sheetsApi, spreadsheetId, "Stocks_Hautmont", stocksHautmont);
    await writeSheet(sheetsApi, spreadsheetId, "Stocks_Le_Quesnoy", stocksLeQuesnoy);
    await writeSheet(sheetsApi, spreadsheetId, "Stocks_Global_Calcule", stocksGlobal);
    await writeSheet(sheetsApi, spreadsheetId, "Historique", historique);

    // Marquer lignes inventaire sync
    if (inventoryLines.length > 0) {
      await prisma.inventoryLine.updateMany({
        where: { id: { in: inventoryLines.map((l) => l.id) } },
        data: { syncedToSheetsAt: new Date() },
      });
    }

    return { ok: true, spreadsheetId, sheets: written };
  } catch (err) {
    console.error("[google/sheets] sync failed:", err);
    return {
      ok: false,
      code: "SYNC_FAILED",
      message: err instanceof Error ? err.message : "Échec sync Sheets",
    };
  }
}
