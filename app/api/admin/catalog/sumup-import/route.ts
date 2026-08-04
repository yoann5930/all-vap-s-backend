import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import {
  HAUTMONT_STOCK_CODE,
  LE_QUESNOY_STOCK_CODE,
  STORE_STOCK_CODES,
  stockCodeDisplayName,
  isStoreStockCode,
} from "@/lib/catalog/normalize";
import { SUMUP_CSV_TEMPLATE } from "@/lib/catalog/sumup-csv-import";
import {
  applySumUpCsvImport,
  previewSumUpCsvImport,
} from "@/lib/catalog/sumup-import-service";

export async function GET() {
  try {
    await requireAuth("ADMIN");
    return jsonResponse({
      template: SUMUP_CSV_TEMPLATE,
      locations: STORE_STOCK_CODES.map((code) => ({
        code,
        name: stockCodeDisplayName(code),
      })),
      rules: {
        dryRunDefault: true,
        dualStoreStock: true,
        requiredLocationCode: true,
        noInventedQuantities: true,
        noAutoMergeBelow95: true,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth("ADMIN");

    const contentType = request.headers.get("content-type") || "";
    let csvContent = "";
    let dryRun = true;
    let createUnmatched = false;
    let confirmToken = "";
    let locationCodeRaw = HAUTMONT_STOCK_CODE;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return jsonResponse({ error: "Fichier CSV requis" }, 400);
      }
      csvContent = await file.text();
      dryRun = String(form.get("dryRun") ?? "true") !== "false";
      createUnmatched = String(form.get("createUnmatched") || "") === "true";
      confirmToken = String(form.get("confirmToken") || "");
      locationCodeRaw = String(form.get("locationCode") || HAUTMONT_STOCK_CODE);
    } else {
      const body = z
        .object({
          csvContent: z.string().min(1),
          dryRun: z.boolean().default(true),
          createUnmatched: z.boolean().optional(),
          confirmToken: z.string().optional(),
          locationCode: z.enum([HAUTMONT_STOCK_CODE, LE_QUESNOY_STOCK_CODE]),
        })
        .parse(await request.json());
      csvContent = body.csvContent;
      dryRun = body.dryRun;
      createUnmatched = Boolean(body.createUnmatched);
      confirmToken = body.confirmToken || "";
      locationCodeRaw = body.locationCode;
    }

    if (!isStoreStockCode(locationCodeRaw)) {
      return jsonResponse(
        { error: "locationCode obligatoire : HAUTMONT ou LE_QUESNOY" },
        400
      );
    }

    if (dryRun) {
      const preview = await previewSumUpCsvImport({
        csvContent,
        locationCode: locationCodeRaw,
      });
      return jsonResponse({
        ...preview,
        dryRun: true,
        applied: false,
        message: "Simulation — aucune écriture. Vérifiez le rapport avant confirmation.",
      });
    }

    const result = await applySumUpCsvImport({
      csvContent,
      dryRun: false,
      createUnmatched,
      confirmToken,
      locationCode: locationCodeRaw,
    });

    return jsonResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}
