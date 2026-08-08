-- Phase 2 catalogue SumUp — stock général UNIQUE
-- Emplacement officiel : GLOBAL_ALL_VAPS (Stock général All Vap's)
-- Ne crée PAS HAUTMONT ni LE_QUESNOY
-- Additive — aucune suppression destructive de produits

-- AlterTable Product
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "normalizedName" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "subcategory" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "range" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "productType" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'EUR';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "barcode" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sumupProductId" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sumupVariantId" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "visibleOnline" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS "Product_normalizedName_idx" ON "Product"("normalizedName");
CREATE INDEX IF NOT EXISTS "Product_barcode_idx" ON "Product"("barcode");
CREATE INDEX IF NOT EXISTS "Product_sumupProductId_idx" ON "Product"("sumupProductId");
CREATE INDEX IF NOT EXISTS "Product_source_idx" ON "Product"("source");

CREATE TABLE IF NOT EXISTS "ProductVariant" (
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
);

CREATE INDEX IF NOT EXISTS "ProductVariant_productId_idx" ON "ProductVariant"("productId");
CREATE INDEX IF NOT EXISTS "ProductVariant_sku_idx" ON "ProductVariant"("sku");
CREATE INDEX IF NOT EXISTS "ProductVariant_barcode_idx" ON "ProductVariant"("barcode");
CREATE INDEX IF NOT EXISTS "ProductVariant_sumupVariantId_idx" ON "ProductVariant"("sumupVariantId");

CREATE TABLE IF NOT EXISTS "ProductFlavor" (
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
);

CREATE INDEX IF NOT EXISTS "ProductFlavor_productId_idx" ON "ProductFlavor"("productId");
CREATE INDEX IF NOT EXISTS "ProductFlavor_flavorFamily_idx" ON "ProductFlavor"("flavorFamily");

CREATE TABLE IF NOT EXISTS "StockLocation" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockLocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StockLocation_code_key" ON "StockLocation"("code");

CREATE TABLE IF NOT EXISTS "StockLevel" (
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
);

CREATE UNIQUE INDEX IF NOT EXISTS "StockLevel_variantId_locationId_key" ON "StockLevel"("variantId", "locationId");
CREATE INDEX IF NOT EXISTS "StockLevel_locationId_idx" ON "StockLevel"("locationId");
CREATE INDEX IF NOT EXISTS "StockLevel_productId_idx" ON "StockLevel"("productId");
CREATE INDEX IF NOT EXISTS "StockLevel_availableQuantity_idx" ON "StockLevel"("availableQuantity");

CREATE TABLE IF NOT EXISTS "StockMovement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "locationId" TEXT NOT NULL,
    "movementType" TEXT NOT NULL,
    "quantityBefore" INTEGER NOT NULL,
    "quantityChange" INTEGER NOT NULL,
    "quantityAfter" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "externalReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StockMovement_productId_createdAt_idx" ON "StockMovement"("productId", "createdAt");
CREATE INDEX IF NOT EXISTS "StockMovement_locationId_createdAt_idx" ON "StockMovement"("locationId", "createdAt");
CREATE INDEX IF NOT EXISTS "StockMovement_movementType_idx" ON "StockMovement"("movementType");
CREATE UNIQUE INDEX IF NOT EXISTS "StockMovement_externalReference_key"
  ON "StockMovement"("externalReference")
  WHERE "externalReference" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "SyncRun" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "locationCode" TEXT,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "unchangedCount" INTEGER NOT NULL DEFAULT 0,
    "unmatchedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "createCount" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" TEXT,
    "reportJson" TEXT,
    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProductMatch" (
    "id" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceProductId" TEXT,
    "sourceName" TEXT NOT NULL,
    "normalizedSourceName" TEXT NOT NULL,
    "matchedProductId" TEXT,
    "matchMethod" TEXT,
    "confidenceScore" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "validatedBy" TEXT,
    "validatedAt" TIMESTAMP(3),
    "locationCode" TEXT,
    "syncRunId" TEXT,
    "payloadSafe" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductMatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProductMatch_status_idx" ON "ProductMatch"("status");
CREATE INDEX IF NOT EXISTS "ProductMatch_normalizedSourceName_idx" ON "ProductMatch"("normalizedSourceName");
CREATE INDEX IF NOT EXISTS "ProductMatch_syncRunId_idx" ON "ProductMatch"("syncRunId");
CREATE INDEX IF NOT EXISTS "ProductMatch_matchedProductId_idx" ON "ProductMatch"("matchedProductId");

CREATE TABLE IF NOT EXISTS "SyncError" (
    "id" TEXT NOT NULL,
    "syncRunId" TEXT NOT NULL,
    "sourceRow" INTEGER,
    "sourceReference" TEXT,
    "errorType" TEXT NOT NULL,
    "errorMessage" TEXT NOT NULL,
    "payloadSafe" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SyncError_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SyncError_syncRunId_idx" ON "SyncError"("syncRunId");
CREATE INDEX IF NOT EXISTS "SyncError_resolved_idx" ON "SyncError"("resolved");

DO $$ BEGIN
  ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ProductFlavor" ADD CONSTRAINT "ProductFlavor_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ProductMatch" ADD CONSTRAINT "ProductMatch_matchedProductId_fkey"
    FOREIGN KEY ("matchedProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ProductMatch" ADD CONSTRAINT "ProductMatch_syncRunId_fkey"
    FOREIGN KEY ("syncRunId") REFERENCES "SyncRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "SyncError" ADD CONSTRAINT "SyncError_syncRunId_fkey"
    FOREIGN KEY ("syncRunId") REFERENCES "SyncRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Emplacement UNIQUE : stock général All Vap's
INSERT INTO "StockLocation" ("id", "code", "name", "address", "active", "createdAt", "updatedAt")
VALUES
  ('loc_global_all_vaps', 'GLOBAL_ALL_VAPS', 'Stock général All Vap''s', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "active" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

-- Si une ancienne tentative locale avait créé HAUTMONT / LE_QUESNOY : désactiver (pas de DROP)
UPDATE "StockLocation"
SET "active" = false, "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" IN ('HAUTMONT', 'LE_QUESNOY');

-- Variante par défaut pour chaque produit existant (sans inventer de quantité)
INSERT INTO "ProductVariant" ("id", "productId", "name", "sku", "barcode", "active", "createdAt", "updatedAt")
SELECT
  'var_default_' || p."id",
  p."id",
  'Standard',
  p."sku",
  NULL,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Product" p
WHERE NOT EXISTS (
  SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p."id"
);
