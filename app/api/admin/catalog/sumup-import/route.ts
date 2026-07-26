import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { GLOBAL_STOCK_CODE, GLOBAL_STOCK_NAME } from "@/lib/catalog/normalize";
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
      location: { code: GLOBAL_STOCK_CODE, name: GLOBAL_STOCK_NAME },
      rules: {
        dryRunDefault: true,
        singleGlobalStock: true,
        noBoutiqueStock: true,
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
    } else {
      const body = z
        .object({
          csvContent: z.string().min(1),
          dryRun: z.boolean().default(true),
          createUnmatched: z.boolean().optional(),
          confirmToken: z.string().optional(),
        })
        .parse(await request.json());
      csvContent = body.csvContent;
      dryRun = body.dryRun;
      createUnmatched = Boolean(body.createUnmatched);
      confirmToken = body.confirmToken || "";
    }

    if (dryRun) {
      const preview = await previewSumUpCsvImport({ csvContent });
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
    });

    return jsonResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}
