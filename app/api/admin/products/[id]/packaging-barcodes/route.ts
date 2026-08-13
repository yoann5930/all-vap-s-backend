/**
 * Admin — codes-barres associés + conditionnement produit.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { getAuthUser } from "@/lib/jwt";
import {
  attachBarcodeToProduct,
  detachBarcodeFromProduct,
  listProductBarcodes,
} from "@/lib/inventory/product-barcodes";
import {
  formatPackagedStockLabel,
  isPackagedHardwareCategory,
  normalizeUnitsPerBox,
  splitUnitsIntoBoxes,
} from "@/lib/inventory/packaging";
import { getDualStockForProduct } from "@/lib/catalog/stock";

type Ctx = { params: Promise<{ id: string }> };

async function requireAdmin() {
  const user = await getAuthUser();
  if (!user || user.role !== "ADMIN") throw new Error("UNAUTHORIZED");
  return user;
}

export async function GET(_req: NextRequest, context: Ctx) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const product = await prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        barcode: true,
        category: true,
        productFamily: true,
        unitsPerBox: true,
        brand: true,
        range: true,
        volumeMl: true,
      },
    });
    if (!product) return jsonResponse({ error: "Produit introuvable" }, 404);

    const barcodes = await listProductBarcodes(id);
    const dual = await getDualStockForProduct(id);
    const packagingRelevant = isPackagedHardwareCategory({
      name: product.name,
      category: product.category,
      productFamily: product.productFamily,
    });
    const unitsPerBox = product.unitsPerBox;
    const stockLabel = formatPackagedStockLabel({
      totalUnits: dual.global.quantity,
      unitsPerBox,
    });
    const split =
      unitsPerBox != null
        ? splitUnitsIntoBoxes({
            totalUnits: dual.global.quantity,
            unitsPerBox,
          })
        : null;

    return jsonResponse({
      product,
      barcodes,
      packagingRelevant,
      unitsPerBox,
      stock: {
        hautmont: dual.hautmont.quantity,
        leQuesnoy: dual.leQuesnoy.quantity,
        global: dual.global.quantity,
        label: stockLabel,
        fullBoxes: split?.fullBoxes ?? null,
        looseUnits: split?.looseUnits ?? null,
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("attach_barcode"),
    barcode: z.string().min(6).max(64),
    role: z.enum(["PRIMARY", "ALIAS"]).optional(),
    label: z.string().max(120).optional().nullable(),
  }),
  z.object({
    action: z.literal("detach_barcode"),
    barcode: z.string().min(6).max(64),
  }),
  z.object({
    action: z.literal("set_units_per_box"),
    unitsPerBox: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.null()]),
  }),
]);

export async function POST(req: NextRequest, context: Ctx) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const body = postSchema.parse(await req.json());

    if (body.action === "attach_barcode") {
      const r = await attachBarcodeToProduct({
        productId: id,
        barcode: body.barcode,
        role: body.role,
        label: body.label,
      });
      if (!r.ok) return jsonResponse(r, 400);
      const barcodes = await listProductBarcodes(id);
      return jsonResponse({ ok: true, barcodes });
    }

    if (body.action === "detach_barcode") {
      const r = await detachBarcodeFromProduct({
        productId: id,
        barcode: body.barcode,
      });
      if (!r.ok) return jsonResponse(r, 400);
      const barcodes = await listProductBarcodes(id);
      return jsonResponse({ ok: true, barcodes });
    }

    if (body.action === "set_units_per_box") {
      const product = await prisma.product.findUnique({
        where: { id },
        select: { name: true, category: true, productFamily: true },
      });
      if (!product) return jsonResponse({ error: "Produit introuvable" }, 404);
      const relevant = isPackagedHardwareCategory(product);
      if (body.unitsPerBox != null && !relevant) {
        return jsonResponse(
          { error: "Conditionnement réservé aux résistances / réservoirs" },
          400
        );
      }
      const n =
        body.unitsPerBox == null ? null : normalizeUnitsPerBox(body.unitsPerBox);
      if (body.unitsPerBox != null && n == null) {
        return jsonResponse({ error: "Valeur autorisée : 1, 2, 3, 4 ou 5" }, 400);
      }
      await prisma.product.update({
        where: { id },
        data: { unitsPerBox: n },
      });
      return jsonResponse({ ok: true, unitsPerBox: n });
    }

    return jsonResponse({ error: "Action inconnue" }, 400);
  } catch (e) {
    return handleApiError(e);
  }
}
