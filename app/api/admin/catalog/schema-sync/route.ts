import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import prisma from "@/lib/prisma";

/**
 * SQL additif uniquement — colonnes / tables phase2 catalogue.
 * Pas de DROP, pas de TRUNCATE, pas de DELETE.
 */
const ADDITIVE_STATEMENTS = [
  `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "normalizedName" TEXT`,
  `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "subcategory" TEXT`,
  `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "range" TEXT`,
  `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "productType" TEXT`,
  `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'EUR'`,
  `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "barcode" TEXT`,
  `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sumupProductId" TEXT`,
  `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sumupVariantId" TEXT`,
  `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'manual'`,
  `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "visibleOnline" BOOLEAN NOT NULL DEFAULT true`,
  `CREATE INDEX IF NOT EXISTS "Product_normalizedName_idx" ON "Product"("normalizedName")`,
  `CREATE INDEX IF NOT EXISTS "Product_barcode_idx" ON "Product"("barcode")`,
  `CREATE INDEX IF NOT EXISTS "Product_sumupProductId_idx" ON "Product"("sumupProductId")`,
  `CREATE INDEX IF NOT EXISTS "Product_source_idx" ON "Product"("source")`,
  `CREATE TABLE IF NOT EXISTS "Brand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Brand_slug_key" ON "Brand"("slug")`,
  `CREATE TABLE IF NOT EXISTS "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Category_slug_key" ON "Category"("slug")`,
  `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "categoryId" TEXT`,
  `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "brandId" TEXT`,
  `CREATE TABLE IF NOT EXISTS "ProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "barcode" TEXT,
    "nicotineMg" DOUBLE PRECISION,
    "nicotineLabel" TEXT,
    "powerWatts" DOUBLE PRECISION,
    "resistanceOhms" DOUBLE PRECISION,
    "capacityMl" DOUBLE PRECISION,
    "color" TEXT,
    "size" TEXT,
    "strength" TEXT,
    "sumupVariantId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "ProductVariant_productId_idx" ON "ProductVariant"("productId")`,
  `CREATE INDEX IF NOT EXISTS "ProductVariant_sku_idx" ON "ProductVariant"("sku")`,
  `CREATE INDEX IF NOT EXISTS "ProductVariant_barcode_idx" ON "ProductVariant"("barcode")`,
  `CREATE INDEX IF NOT EXISTS "ProductVariant_sumupVariantId_idx" ON "ProductVariant"("sumupVariantId")`,
  `CREATE TABLE IF NOT EXISTS "ProductFlavor" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "primaryFlavor" TEXT,
    "secondaryFlavor" TEXT,
    "flavorFamily" TEXT,
    "isFresh" BOOLEAN,
    "isFruity" BOOLEAN,
    "isGourmet" BOOLEAN,
    "isTobacco" BOOLEAN,
    "isMint" BOOLEAN,
    "isDrink" BOOLEAN,
    "confidenceScore" DOUBLE PRECISION,
    "validatedManually" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductFlavor_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "ProductFlavor_productId_idx" ON "ProductFlavor"("productId")`,
  `CREATE INDEX IF NOT EXISTS "ProductFlavor_flavorFamily_idx" ON "ProductFlavor"("flavorFamily")`,
  `CREATE TABLE IF NOT EXISTS "StockLocation" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockLocation_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "StockLocation_code_key" ON "StockLocation"("code")`,
  `CREATE TABLE IF NOT EXISTS "StockLevel" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reservedQuantity" INTEGER NOT NULL DEFAULT 0,
    "availableQuantity" INTEGER NOT NULL DEFAULT 0,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 3,
    "source" TEXT NOT NULL DEFAULT 'unknown',
    "lastSyncedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockLevel_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "StockLevel_variantId_locationId_key" ON "StockLevel"("variantId", "locationId")`,
  `CREATE INDEX IF NOT EXISTS "StockLevel_locationId_idx" ON "StockLevel"("locationId")`,
  `CREATE INDEX IF NOT EXISTS "StockLevel_productId_idx" ON "StockLevel"("productId")`,
  `CREATE INDEX IF NOT EXISTS "StockLevel_availableQuantity_idx" ON "StockLevel"("availableQuantity")`,
  `ALTER TABLE "ProductRange" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'a_verifier'`,
  `ALTER TABLE "ProductRange" ADD COLUMN IF NOT EXISTS "verificationStatus" TEXT NOT NULL DEFAULT 'NEEDS_CONFIRMATION'`,
  `ALTER TABLE "ProductRange" ADD COLUMN IF NOT EXISTS "catalogVisible" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "rangeId" TEXT`,
  `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "volumeMl" INTEGER`,
];

async function authorize(request: NextRequest) {
  const headerSecret = request.headers.get("x-catalog-import-secret") || "";
  const envSecret = (process.env.CATALOG_IMPORT_SECRET || "").trim();
  if (envSecret && headerSecret && headerSecret === envSecret) {
    return { mode: "secret" as const };
  }
  await requireAuth("ADMIN");
  return { mode: "admin" as const };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    const applied: string[] = [];
    const errors: string[] = [];

    for (const sql of ADDITIVE_STATEMENTS) {
      const label = sql.slice(0, 72).replace(/\s+/g, " ");
      try {
        await prisma.$executeRawUnsafe(sql);
        applied.push(label);
      } catch (err) {
        errors.push(`${label} => ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const fks = [
      `DO $$ BEGIN ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      `DO $$ BEGIN ALTER TABLE "ProductFlavor" ADD CONSTRAINT "ProductFlavor_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      `DO $$ BEGIN ALTER TABLE "Product" ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      `DO $$ BEGIN ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    ];
    for (const sql of fks) {
      try {
        await prisma.$executeRawUnsafe(sql);
        applied.push("FK ok");
      } catch (err) {
        errors.push(`FK => ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const cols = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'Product' AND column_name = 'normalizedName'`
    );

    return jsonResponse({
      ok: errors.length === 0 || cols.length > 0,
      auth: auth.mode,
      appliedCount: applied.length,
      errorCount: errors.length,
      hasNormalizedName: cols.length > 0,
      errors: errors.slice(0, 15),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
