import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { importCatalogCsv, attachProductImage } from "@/lib/catalog/import-unified";
import { ensureLiquidaromRanges } from "@/lib/catalog/ranges";

export async function POST(request: NextRequest) {
  try {
    await requireAuth("ADMIN");
    const contentType = request.headers.get("content-type") || "";
    const url = new URL(request.url);
    const dryRun = url.searchParams.get("dryRun") === "true";
    const action = url.searchParams.get("action") || "csv";

    if (action === "seed-ranges") {
      const brand = await ensureLiquidaromRanges();
      return jsonResponse({ ok: true, brandId: brand.id });
    }

    if (action === "image") {
      const body = await request.json();
      const image = await attachProductImage(body);
      return jsonResponse(image, 201);
    }

    let csvContent = "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (file instanceof File) csvContent = await file.text();
    } else {
      const body = await request.json();
      csvContent = body.content || body.csv || "";
    }

    if (!csvContent.trim()) {
      return jsonResponse({ error: "Contenu CSV vide" }, 400);
    }

    const stats = await importCatalogCsv(csvContent, dryRun);
    return jsonResponse({ dryRun, ...stats });
  } catch (error) {
    return handleApiError(error);
  }
}
