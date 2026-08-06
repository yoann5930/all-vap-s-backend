import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

/**
 * Liste admin du catalogue brut SumUp (lecture seule + filtres).
 * Ne modifie jamais SumUp. Ne publie / n'active rien automatiquement.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth("ADMIN");
    const sp = request.nextUrl.searchParams;
    const status = sp.get("status"); // valide | a_verifier | brut_importe | actif | archive
    const filter = sp.get("filter"); // validated | to_verify | no_barcode | ambiguous | active | invisible | family
    const family = sp.get("family");
    const q = (sp.get("q") || "").trim();
    const take = Math.min(Number(sp.get("take") || 100), 500);
    const skip = Math.max(Number(sp.get("skip") || 0), 0);

    const where: Record<string, unknown> = {
      source: "sumup_import",
    };

    if (status) where.catalogStatus = status;
    if (family) where.productFamily = family;

    if (filter === "validated") where.catalogStatus = "valide";
    if (filter === "to_verify") where.catalogStatus = "a_verifier";
    if (filter === "no_barcode") where.OR = [{ barcode: null }, { barcode: "" }];
    if (filter === "ambiguous") where.importAnomaly = { not: null };
    if (filter === "active") where.isActive = true;
    if (filter === "invisible") where.visibleOnline = false;

    if (q) {
      where.AND = [
        {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { sumupName: { contains: q, mode: "insensitive" } },
            { barcode: { contains: q } },
            { sumupProductId: { contains: q } },
            { sumupVariantId: { contains: q } },
          ],
        },
      ];
    }

    const [items, total, counts] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: [{ catalogStatus: "asc" }, { category: "asc" }, { name: "asc" }],
        take,
        skip,
        select: {
          id: true,
          name: true,
          sumupName: true,
          category: true,
          barcode: true,
          sumupProductId: true,
          sumupVariantId: true,
          catalogStatus: true,
          isActive: true,
          visibleOnline: true,
          productFamily: true,
          source: true,
          lastCatalogImportAt: true,
          importAnomaly: true,
          priceCents: true,
          stock: true,
        },
      }),
      prisma.product.count({ where }),
      Promise.all([
        prisma.product.count({ where: { source: "sumup_import" } }),
        prisma.product.count({ where: { source: "sumup_import", catalogStatus: "valide" } }),
        prisma.product.count({ where: { source: "sumup_import", catalogStatus: "a_verifier" } }),
        prisma.product.count({ where: { source: "sumup_import", isActive: true } }),
        prisma.product.count({ where: { source: "sumup_import", visibleOnline: true } }),
        prisma.product.count({
          where: { source: "sumup_import", OR: [{ barcode: null }, { barcode: "" }] },
        }),
      ]),
    ]);

    const families = await prisma.product.groupBy({
      by: ["productFamily"],
      where: { source: "sumup_import", productFamily: { not: null } },
      _count: true,
      orderBy: { productFamily: "asc" },
    });

    return jsonResponse({
      items,
      total,
      take,
      skip,
      stats: {
        totalSumupImport: counts[0],
        validated: counts[1],
        toVerify: counts[2],
        active: counts[3],
        visible: counts[4],
        noBarcode: counts[5],
      },
      families: families.map((f) => ({
        family: f.productFamily,
        count: f._count,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
