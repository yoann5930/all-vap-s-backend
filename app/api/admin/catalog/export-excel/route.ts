import { requireAuth } from "@/lib/jwt";
import { handleApiError } from "@/lib/api-utils";
import { generateCatalogStockWorkbook } from "@/lib/catalog/export-excel";

export async function GET() {
  try {
    await requireAuth("ADMIN");
    const buffer = await generateCatalogStockWorkbook();

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="CATALOGUE_STOCK_ALL_VAPS.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
