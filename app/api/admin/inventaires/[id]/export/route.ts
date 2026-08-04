import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/jwt";
import { handleApiError } from "@/lib/api-utils";
import prisma from "@/lib/prisma";
import {
  buildInventoryCsv,
  buildInventoryExcel,
  buildInventoryPdf,
  type ExportLine,
} from "@/lib/inventory/export";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Ctx) {
  try {
    await requireAuth("ADMIN");
    const { id } = await context.params;
    const format = (new URL(request.url).searchParams.get("format") || "csv").toLowerCase();

    const session = await prisma.inventorySession.findUnique({
      where: { id },
      include: {
        location: true,
        lines: {
          orderBy: { scannedAt: "asc" },
          include: { photos: { orderBy: { createdAt: "desc" }, take: 1 } },
        },
      },
    });
    if (!session) throw new Error("NOT_FOUND");

    const meta = {
      id: session.id,
      status: session.status,
      storeName: session.location.name,
      employeeName: session.employeeName,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
    };

    const lines: ExportLine[] = session.lines.map((l) => ({
      barcode: l.barcode,
      productName: l.productNameSnapshot || l.productId || null,
      brand: l.brandSnapshot,
      category: l.categorySnapshot,
      quantity: l.quantityCounted,
      unitPriceCents: l.unitPriceCents,
      totalValueCents: l.totalValueCents,
      storeName: session.location.name,
      employeeName: session.employeeName,
      scannedAt: l.scannedAt || l.createdAt,
      photoUrl: l.photos[0]?.publicUrl || l.photoPath,
      notes: l.notes,
    }));

    // Enrich product names from relation if snapshot missing
    const withProducts = await prisma.inventoryLine.findMany({
      where: { sessionId: id },
      include: { product: { select: { name: true } }, photos: true },
    });
    const nameById = new Map(
      withProducts.map((l) => [l.id, l.productNameSnapshot || l.product?.name || null])
    );
    for (let i = 0; i < lines.length; i++) {
      const raw = session.lines[i];
      lines[i].productName = nameById.get(raw.id) || lines[i].productName;
    }

    if (format === "xlsx" || format === "excel") {
      const buf = await buildInventoryExcel(meta, lines);
      return new Response(new Uint8Array(buf), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="inventaire-${id}.xlsx"`,
        },
      });
    }

    if (format === "pdf") {
      const buf = buildInventoryPdf(meta, lines);
      return new Response(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="inventaire-${id}.pdf"`,
        },
      });
    }

    const csv = buildInventoryCsv(meta, lines);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="inventaire-${id}.csv"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
