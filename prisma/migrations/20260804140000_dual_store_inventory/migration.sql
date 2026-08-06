-- Dual store stock + inventory sessions
-- Writable locations: HAUTMONT, LE_QUESNOY
-- GLOBAL_ALL_VAPS becomes inactive legacy (quantities moved to HAUTMONT, no duplication)

-- Ensure store locations
INSERT INTO "StockLocation" ("id", "code", "name", "address", "active", "createdAt", "updatedAt")
VALUES
  ('loc_hautmont', 'HAUTMONT', 'All Vap''s Hautmont', '17 Avenue Marcel Aimé, 59330 Hautmont', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('loc_le_quesnoy', 'LE_QUESNOY', 'All Vap''s Le Quesnoy', '10 Rue Léon Gambetta, 59530 Le Quesnoy', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "address" = EXCLUDED."address",
  "active" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

-- Move GLOBAL_ALL_VAPS StockLevel → HAUTMONT when HAUTMONT has no row for that variant
UPDATE "StockLevel" AS sl
SET
  "locationId" = (SELECT "id" FROM "StockLocation" WHERE "code" = 'HAUTMONT'),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE sl."locationId" = (SELECT "id" FROM "StockLocation" WHERE "code" = 'GLOBAL_ALL_VAPS')
  AND NOT EXISTS (
    SELECT 1 FROM "StockLevel" AS other
    WHERE other."variantId" = sl."variantId"
      AND other."locationId" = (SELECT "id" FROM "StockLocation" WHERE "code" = 'HAUTMONT')
  );

-- If HAUTMONT already has a row, merge quantities from GLOBAL then delete GLOBAL row
UPDATE "StockLevel" AS h
SET
  "quantity" = h."quantity" + g."quantity",
  "reservedQuantity" = h."reservedQuantity" + g."reservedQuantity",
  "availableQuantity" = GREATEST(0, (h."quantity" + g."quantity") - (h."reservedQuantity" + g."reservedQuantity")),
  "updatedAt" = CURRENT_TIMESTAMP
FROM "StockLevel" AS g
WHERE h."variantId" = g."variantId"
  AND h."locationId" = (SELECT "id" FROM "StockLocation" WHERE "code" = 'HAUTMONT')
  AND g."locationId" = (SELECT "id" FROM "StockLocation" WHERE "code" = 'GLOBAL_ALL_VAPS');

DELETE FROM "StockLevel"
WHERE "locationId" = (SELECT "id" FROM "StockLocation" WHERE "code" = 'GLOBAL_ALL_VAPS');

-- Re-point movements from GLOBAL → HAUTMONT (audit trail stays attached to boutique)
UPDATE "StockMovement"
SET "locationId" = (SELECT "id" FROM "StockLocation" WHERE "code" = 'HAUTMONT')
WHERE "locationId" = (SELECT "id" FROM "StockLocation" WHERE "code" = 'GLOBAL_ALL_VAPS');

-- Deactivate legacy global location
UPDATE "StockLocation"
SET "active" = false,
    "name" = 'Stock général All Vap''s (legacy)',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'GLOBAL_ALL_VAPS';

-- Recalculate Product.stock = sum(HAUTMONT + LE_QUESNOY)
UPDATE "Product" AS p
SET "stock" = COALESCE((
  SELECT SUM(sl."quantity")
  FROM "StockLevel" AS sl
  INNER JOIN "StockLocation" AS loc ON loc."id" = sl."locationId"
  WHERE sl."productId" = p."id"
    AND loc."code" IN ('HAUTMONT', 'LE_QUESNOY')
), p."stock"),
"updatedAt" = CURRENT_TIMESTAMP;

-- Inventory tables
CREATE TABLE IF NOT EXISTS "InventorySession" (
  "id" TEXT NOT NULL,
  "employeeName" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdByUserId" TEXT,
  "notes" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventorySession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InventoryLine" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "productId" TEXT,
  "variantId" TEXT,
  "barcode" TEXT,
  "quantityCounted" INTEGER NOT NULL,
  "photoPath" TEXT,
  "driveFileId" TEXT,
  "syncedToSheetsAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InventorySession_locationId_status_idx" ON "InventorySession"("locationId", "status");
CREATE INDEX IF NOT EXISTS "InventorySession_startedAt_idx" ON "InventorySession"("startedAt");
CREATE INDEX IF NOT EXISTS "InventoryLine_sessionId_idx" ON "InventoryLine"("sessionId");
CREATE INDEX IF NOT EXISTS "InventoryLine_productId_idx" ON "InventoryLine"("productId");
CREATE INDEX IF NOT EXISTS "InventoryLine_barcode_idx" ON "InventoryLine"("barcode");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InventorySession_locationId_fkey'
  ) THEN
    ALTER TABLE "InventorySession"
      ADD CONSTRAINT "InventorySession_locationId_fkey"
      FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InventoryLine_sessionId_fkey'
  ) THEN
    ALTER TABLE "InventoryLine"
      ADD CONSTRAINT "InventoryLine_sessionId_fkey"
      FOREIGN KEY ("sessionId") REFERENCES "InventorySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InventoryLine_productId_fkey'
  ) THEN
    ALTER TABLE "InventoryLine"
      ADD CONSTRAINT "InventoryLine_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
