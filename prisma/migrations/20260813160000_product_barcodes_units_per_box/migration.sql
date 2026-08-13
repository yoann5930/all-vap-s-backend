-- Conditionnement résistances/réservoirs + multi codes-barres (même stock canonique)
-- Rétrocompatible : Product.barcode reste le primaire dénormalisé.

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "unitsPerBox" INTEGER;
CREATE INDEX IF NOT EXISTS "Product_unitsPerBox_idx" ON "Product"("unitsPerBox");

ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "unitsPerBox" INTEGER;

CREATE TABLE IF NOT EXISTS "ProductBarcode" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "barcode" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'ALIAS',
  "label" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductBarcode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductBarcode_barcode_key" ON "ProductBarcode"("barcode");
CREATE INDEX IF NOT EXISTS "ProductBarcode_productId_idx" ON "ProductBarcode"("productId");
CREATE INDEX IF NOT EXISTS "ProductBarcode_role_idx" ON "ProductBarcode"("role");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProductBarcode_productId_fkey'
  ) THEN
    ALTER TABLE "ProductBarcode"
      ADD CONSTRAINT "ProductBarcode_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill : Product.barcode → ProductBarcode PRIMARY (sans doublon)
INSERT INTO "ProductBarcode" ("id", "productId", "barcode", "role", "label", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text || p."id"),
  p."id",
  trim(p."barcode"),
  'PRIMARY',
  'primary',
  NOW(),
  NOW()
FROM "Product" p
WHERE p."barcode" IS NOT NULL
  AND trim(p."barcode") <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "ProductBarcode" pb WHERE pb."barcode" = trim(p."barcode")
  );

-- Sync CatalogEanMap pour les EAN primaires déjà présents
INSERT INTO "CatalogEanMap" ("id", "ean", "productId", "category", "confidence", "source", "validatedAt", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text || p."id"),
  trim(p."barcode"),
  p."id",
  p."category",
  'CONFIRME',
  'product_barcode_backfill',
  NOW(),
  NOW(),
  NOW()
FROM "Product" p
WHERE p."barcode" IS NOT NULL
  AND trim(p."barcode") <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "CatalogEanMap" m WHERE m."ean" = trim(p."barcode")
  );

ALTER TABLE "InventoryLine" ADD COLUMN IF NOT EXISTS "unitsPerBoxSnapshot" INTEGER;
ALTER TABLE "InventoryLine" ADD COLUMN IF NOT EXISTS "fullBoxesSnapshot" INTEGER;
ALTER TABLE "InventoryLine" ADD COLUMN IF NOT EXISTS "looseUnitsSnapshot" INTEGER;
