import { parseCsv } from "@/lib/import/csv";
import {
  extractExplicitSpecs,
  GLOBAL_STOCK_CODE,
  GLOBAL_STOCK_NAME,
  normalizeProductName,
} from "@/lib/catalog/normalize";
import {
  matchCatalogProduct,
  type CatalogMatchCandidate,
  type MatchDecision,
  type MatchMethod,
} from "@/lib/catalog/matching";

export interface SumUpCsvRow {
  rowIndex: number;
  raw: Record<string, string>;
  name: string;
  normalizedName: string;
  barcode: string | null;
  sku: string | null;
  sumupProductId: string | null;
  supplierRef: string | null;
  quantity: number | null;
  priceCents: number | null;
  category: string | null;
  brand: string | null;
}

export interface ImportRowPlan {
  rowIndex: number;
  name: string;
  normalizedName: string;
  barcode: string | null;
  sku: string | null;
  quantity: number | null;
  quantityBefore: number | null;
  quantityAfter: number | null;
  action: "CREATE" | "UPDATE_STOCK" | "UNCHANGED" | "REVIEW" | "UNMATCHED" | "DUPLICATE" | "ERROR";
  matchMethod: MatchMethod;
  confidence: number;
  decision: MatchDecision;
  matchedProductId: string | null;
  message: string;
  specs: ReturnType<typeof extractExplicitSpecs>;
}

export interface SumUpImportPreview {
  locationCode: typeof GLOBAL_STOCK_CODE;
  locationName: typeof GLOBAL_STOCK_NAME;
  dryRun: true;
  detectedColumns: Record<string, string | null>;
  totalRows: number;
  createCount: number;
  updateCount: number;
  unchangedCount: number;
  unmatchedCount: number;
  reviewCount: number;
  duplicateCount: number;
  errorCount: number;
  rows: ImportRowPlan[];
  duplicates: Array<{ name: string; rowIndexes: number[] }>;
  unmatched: ImportRowPlan[];
  review: ImportRowPlan[];
  errors: Array<{ rowIndex: number; message: string }>;
}

const COLUMN_ALIASES: Record<string, string[]> = {
  name: ["name", "nom", "item", "item name", "product", "produit", "title", "libellé", "libelle"],
  barcode: ["barcode", "ean", "ean13", "gtin", "code barre", "code-barres", "codebarres"],
  sku: ["sku", "reference", "référence", "ref", "item code", "code article"],
  sumupProductId: ["sumup id", "sumupid", "item id", "id", "product id", "item_id"],
  supplierRef: ["supplier", "fournisseur", "supplier ref", "ref fournisseur"],
  quantity: ["quantity", "qty", "stock", "quantité", "quantite", "inventory", "en stock"],
  price: ["price", "prix", "unit price", "prix unitaire", "amount"],
  category: ["category", "catégorie", "categorie", "cat"],
  brand: ["brand", "marque"],
};

function detectColumn(headers: string[], field: keyof typeof COLUMN_ALIASES): string | null {
  const aliases = COLUMN_ALIASES[field];
  for (const h of headers) {
    const key = h.trim().toLowerCase();
    if (aliases.includes(key)) return h;
  }
  for (const h of headers) {
    const key = h.trim().toLowerCase();
    if (aliases.some((a) => key.includes(a))) return h;
  }
  return null;
}

function parseQuantity(raw: string | undefined): number | null {
  if (raw == null || raw.trim() === "") return null;
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function parsePriceCents(raw: string | undefined): number | null {
  if (raw == null || raw.trim() === "") return null;
  const cleaned = raw.replace(/\s/g, "").replace("€", "").replace(",", ".");
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  if (cleaned.includes(".") || n < 1000) return Math.round(n * 100);
  return Math.round(n);
}

export function detectSumUpColumns(headers: string[]): Record<string, string | null> {
  return {
    name: detectColumn(headers, "name"),
    barcode: detectColumn(headers, "barcode"),
    sku: detectColumn(headers, "sku"),
    sumupProductId: detectColumn(headers, "sumupProductId"),
    supplierRef: detectColumn(headers, "supplierRef"),
    quantity: detectColumn(headers, "quantity"),
    price: detectColumn(headers, "price"),
    category: detectColumn(headers, "category"),
    brand: detectColumn(headers, "brand"),
  };
}

export function mapSumUpCsvRows(content: string): {
  columns: Record<string, string | null>;
  rows: SumUpCsvRow[];
  parseErrors: Array<{ rowIndex: number; message: string }>;
} {
  const parsed = parseCsv(content);
  if (parsed.length === 0) {
    return {
      columns: detectSumUpColumns([]),
      rows: [],
      parseErrors: [{ rowIndex: 0, message: "CSV vide ou invalide" }],
    };
  }

  const headers = Object.keys(parsed[0]);
  const columns = detectSumUpColumns(headers);
  const parseErrors: Array<{ rowIndex: number; message: string }> = [];
  const rows: SumUpCsvRow[] = [];

  if (!columns.name) {
    parseErrors.push({
      rowIndex: 0,
      message: "Colonne nom/produit introuvable. Attendu : name, nom, item, product…",
    });
    return { columns, rows, parseErrors };
  }

  parsed.forEach((raw, idx) => {
    const rowIndex = idx + 2;
    const name = (raw[columns.name!] || "").trim();
    if (!name) {
      parseErrors.push({ rowIndex, message: "Nom produit manquant" });
      return;
    }

    const quantity = columns.quantity ? parseQuantity(raw[columns.quantity]) : null;
    if (columns.quantity && raw[columns.quantity]?.trim() && quantity === null) {
      parseErrors.push({ rowIndex, message: `Quantité invalide: ${raw[columns.quantity]}` });
      return;
    }

    rows.push({
      rowIndex,
      raw,
      name,
      normalizedName: normalizeProductName(name),
      barcode: columns.barcode ? raw[columns.barcode]?.trim() || null : null,
      sku: columns.sku ? raw[columns.sku]?.trim() || null : null,
      sumupProductId: columns.sumupProductId ? raw[columns.sumupProductId]?.trim() || null : null,
      supplierRef: columns.supplierRef ? raw[columns.supplierRef]?.trim() || null : null,
      quantity,
      priceCents: columns.price ? parsePriceCents(raw[columns.price]) : null,
      category: columns.category ? raw[columns.category]?.trim() || null : null,
      brand: columns.brand ? raw[columns.brand]?.trim() || null : null,
    });
  });

  return { columns, rows, parseErrors };
}

export function buildSumUpImportPreview(params: {
  csvContent: string;
  catalog: CatalogMatchCandidate[];
  currentQuantities?: Map<string, number>;
}): SumUpImportPreview {
  const { columns, rows, parseErrors } = mapSumUpCsvRows(params.csvContent);
  const currentQuantities = params.currentQuantities ?? new Map<string, number>();

  const seenNorm = new Map<string, number[]>();
  const seenBarcode = new Map<string, number[]>();
  for (const r of rows) {
    const list = seenNorm.get(r.normalizedName) ?? [];
    list.push(r.rowIndex);
    seenNorm.set(r.normalizedName, list);
    if (r.barcode) {
      const b = seenBarcode.get(r.barcode) ?? [];
      b.push(r.rowIndex);
      seenBarcode.set(r.barcode, b);
    }
  }

  const duplicateNorms = new Set(
    [...seenNorm.entries()].filter(([, idxs]) => idxs.length > 1).map(([k]) => k)
  );
  const duplicateBarcodes = new Set(
    [...seenBarcode.entries()].filter(([, idxs]) => idxs.length > 1).map(([k]) => k)
  );

  const plans: ImportRowPlan[] = [];
  const errors = [...parseErrors];

  for (const r of rows) {
    const specs = extractExplicitSpecs(r.name);
    const isDup =
      duplicateNorms.has(r.normalizedName) ||
      (r.barcode != null && duplicateBarcodes.has(r.barcode));

    if (isDup) {
      plans.push({
        rowIndex: r.rowIndex,
        name: r.name,
        normalizedName: r.normalizedName,
        barcode: r.barcode,
        sku: r.sku,
        quantity: r.quantity,
        quantityBefore: null,
        quantityAfter: null,
        action: "DUPLICATE",
        matchMethod: "none",
        confidence: 0,
        decision: "UNMATCHED",
        matchedProductId: null,
        message: "Doublon détecté dans le fichier CSV — validation manuelle requise",
        specs,
      });
      continue;
    }

    const match = matchCatalogProduct(
      {
        name: r.name,
        normalizedName: r.normalizedName,
        barcode: r.barcode,
        sku: r.sku,
        sumupProductId: r.sumupProductId,
        supplierRef: r.supplierRef,
      },
      params.catalog
    );

    if (match.decision === "REVIEW") {
      plans.push({
        rowIndex: r.rowIndex,
        name: r.name,
        normalizedName: r.normalizedName,
        barcode: r.barcode,
        sku: r.sku,
        quantity: r.quantity,
        quantityBefore: match.productId != null ? currentQuantities.get(match.productId) ?? null : null,
        quantityAfter: r.quantity,
        action: "REVIEW",
        matchMethod: match.method,
        confidence: match.confidence,
        decision: match.decision,
        matchedProductId: match.productId,
        message: `Correspondance incertaine (${Math.round(match.confidence * 100)} %) — pas de fusion auto`,
        specs,
      });
      continue;
    }

    if (match.decision === "UNMATCHED" || !match.productId) {
      plans.push({
        rowIndex: r.rowIndex,
        name: r.name,
        normalizedName: r.normalizedName,
        barcode: r.barcode,
        sku: r.sku,
        quantity: r.quantity,
        quantityBefore: null,
        quantityAfter: r.quantity,
        action: "UNMATCHED",
        matchMethod: match.method,
        confidence: match.confidence,
        decision: "UNMATCHED",
        matchedProductId: null,
        message: "Produit non reconnu — isolé (création uniquement après confirmation explicite)",
        specs,
      });
      continue;
    }

    const current = currentQuantities.get(match.productId) ?? null;

    if (r.quantity == null) {
      plans.push({
        rowIndex: r.rowIndex,
        name: r.name,
        normalizedName: r.normalizedName,
        barcode: r.barcode,
        sku: r.sku,
        quantity: null,
        quantityBefore: current,
        quantityAfter: current,
        action: "UNCHANGED",
        matchMethod: match.method,
        confidence: match.confidence,
        decision: match.decision,
        matchedProductId: match.productId,
        message: "Quantité absente — aucune modification (pas d'invention)",
        specs,
      });
      continue;
    }

    if (current === r.quantity) {
      plans.push({
        rowIndex: r.rowIndex,
        name: r.name,
        normalizedName: r.normalizedName,
        barcode: r.barcode,
        sku: r.sku,
        quantity: r.quantity,
        quantityBefore: current,
        quantityAfter: r.quantity,
        action: "UNCHANGED",
        matchMethod: match.method,
        confidence: match.confidence,
        decision: match.decision,
        matchedProductId: match.productId,
        message: `Stock général inchangé (${r.quantity})`,
        specs,
      });
      continue;
    }

    plans.push({
      rowIndex: r.rowIndex,
      name: r.name,
      normalizedName: r.normalizedName,
      barcode: r.barcode,
      sku: r.sku,
      quantity: r.quantity,
      quantityBefore: current,
      quantityAfter: r.quantity,
      action: "UPDATE_STOCK",
      matchMethod: match.method,
      confidence: match.confidence,
      decision: match.decision,
      matchedProductId: match.productId,
      message:
        current == null
          ? `Définir stock général = ${r.quantity}`
          : `Mettre à jour stock général : ${current} → ${r.quantity}`,
      specs,
    });
  }

  const unmatched = plans.filter((p) => p.action === "UNMATCHED");
  const duplicates = [...seenNorm.entries()]
    .filter(([, idxs]) => idxs.length > 1)
    .map(([name, rowIndexes]) => ({ name, rowIndexes }));

  return {
    locationCode: GLOBAL_STOCK_CODE,
    locationName: GLOBAL_STOCK_NAME,
    dryRun: true,
    detectedColumns: columns,
    totalRows: rows.length,
    createCount: unmatched.length,
    updateCount: plans.filter((p) => p.action === "UPDATE_STOCK").length,
    unchangedCount: plans.filter((p) => p.action === "UNCHANGED").length,
    unmatchedCount: unmatched.length,
    reviewCount: plans.filter((p) => p.action === "REVIEW").length,
    duplicateCount: plans.filter((p) => p.action === "DUPLICATE").length,
    errorCount: errors.length,
    rows: plans,
    duplicates,
    unmatched,
    review: plans.filter((p) => p.action === "REVIEW"),
    errors,
  };
}

export const SUMUP_CSV_TEMPLATE = `name,barcode,sku,quantity,price,category,brand
E-liquide Frais Rouge 10ml 3mg,1234567890123,FR-10-3,12,5.90,e-liquides,All Vaps
Base DIY 50/50 1L,,DIY-BASE-1L,4,19.90,diy,All Vaps
`;
