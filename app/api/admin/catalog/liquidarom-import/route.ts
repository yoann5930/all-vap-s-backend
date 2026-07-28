import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import {
  importBundledLiquidarom,
  importLiquidaromFromCsv,
} from "@/lib/catalog/liquidarom-import";
import prisma from "@/lib/prisma";

const EMPTY_CATALOG_CONFIRM = "IMPORT_LIQUIDAROM_EMPTY_CATALOG";

async function authorize(request: NextRequest, confirm?: string) {
  const headerSecret = request.headers.get("x-catalog-import-secret") || "";
  const envSecret = (process.env.CATALOG_IMPORT_SECRET || "").trim();
  if (envSecret && headerSecret && headerSecret === envSecret) {
    return { mode: "secret" as const };
  }

  // Bootstrap unique : catalogue vide uniquement (urgence production).
  if (confirm === EMPTY_CATALOG_CONFIRM) {
    const total = await prisma.product.count();
    if (total === 0) {
      return { mode: "empty-bootstrap" as const };
    }
    throw new Error("Bootstrap refusé : le catalogue n'est plus vide.");
  }

  await requireAuth("ADMIN");
  return { mode: "admin" as const };
}

export async function GET() {
  try {
    await requireAuth("ADMIN");
    const [total, active, liquidarom] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({ where: { isActive: true } }),
      prisma.product.count({
        where: { brand: { equals: "Liquidarom", mode: "insensitive" } },
      }),
    ]);
    return jsonResponse({
      total,
      active,
      liquidarom,
      endpoint: "/api/admin/catalog/liquidarom-import",
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = z
      .object({
        dryRun: z.boolean().optional().default(false),
        confirm: z.string().optional(),
        productsCsv: z.string().optional(),
        flavorsCsv: z.string().optional(),
      })
      .parse(await request.json().catch(() => ({})));

    const auth = await authorize(request, body.confirm);

    const stats =
      body.productsCsv && body.flavorsCsv
        ? await importLiquidaromFromCsv({
            productsCsv: body.productsCsv,
            flavorsCsv: body.flavorsCsv,
            dryRun: body.dryRun,
          })
        : await importBundledLiquidarom(body.dryRun);

    const [total, active, liquidarom] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({ where: { isActive: true } }),
      prisma.product.count({
        where: { brand: { equals: "Liquidarom", mode: "insensitive" } },
      }),
    ]);

    return jsonResponse({
      ok: true,
      auth: auth.mode,
      dryRun: body.dryRun,
      stats,
      counts: { total, active, liquidarom },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
