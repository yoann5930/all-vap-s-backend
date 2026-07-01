import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { parseCsv, csvRowToProduct, importProductsFromRows, CSV_TEMPLATE } from "@/lib/import/csv";

export async function GET() {
  return jsonResponse({ template: CSV_TEMPLATE });
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth("ADMIN");

    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await request.json();
      const rows = z.array(z.record(z.string())).parse(body.rows);
      const products = rows.map(csvRowToProduct).filter(Boolean) as NonNullable<ReturnType<typeof csvRowToProduct>>[];
      const result = await importProductsFromRows(products);
      return jsonResponse(result);
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return jsonResponse({ error: "Fichier CSV requis" }, 400);
    }

    const content = await file.text();
    const parsed = parseCsv(content);
    const products = parsed.map(csvRowToProduct).filter(Boolean) as NonNullable<ReturnType<typeof csvRowToProduct>>[];

    if (products.length === 0) {
      return jsonResponse({ error: "Aucune ligne valide dans le fichier" }, 400);
    }

    const result = await importProductsFromRows(products);
    return jsonResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}
