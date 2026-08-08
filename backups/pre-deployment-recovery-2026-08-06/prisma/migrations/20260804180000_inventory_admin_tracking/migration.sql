-- Inventaire admin : prix, snapshots, photos, audit, statuts enrichis

ALTER TABLE "InventorySession" ADD COLUMN IF NOT EXISTS "validatedAt" TIMESTAMP(3);
ALTER TABLE "InventorySession" ADD COLUMN IF NOT EXISTS "validatedByUserId" TEXT;

CREATE INDEX IF NOT EXISTS "InventorySession_status_updatedAt_idx" ON "InventorySession"("status", "updatedAt");

ALTER TABLE "InventoryLine" ADD COLUMN IF NOT EXISTS "productNameSnapshot" TEXT;
ALTER TABLE "InventoryLine" ADD COLUMN IF NOT EXISTS "brandSnapshot" TEXT;
ALTER TABLE "InventoryLine" ADD COLUMN IF NOT EXISTS "rangeSnapshot" TEXT;
ALTER TABLE "InventoryLine" ADD COLUMN IF NOT EXISTS "categorySnapshot" TEXT;
ALTER TABLE "InventoryLine" ADD COLUMN IF NOT EXISTS "formatSnapshot" TEXT;
ALTER TABLE "InventoryLine" ADD COLUMN IF NOT EXISTS "nicotineSnapshot" TEXT;
ALTER TABLE "InventoryLine" ADD COLUMN IF NOT EXISTS "catalogImageUrl" TEXT;
ALTER TABLE "InventoryLine" ADD COLUMN IF NOT EXISTS "unitPriceCents" INTEGER;
ALTER TABLE "InventoryLine" ADD COLUMN IF NOT EXISTS "totalValueCents" INTEGER;
ALTER TABLE "InventoryLine" ADD COLUMN IF NOT EXISTS "priceSource" TEXT;
ALTER TABLE "InventoryLine" ADD COLUMN IF NOT EXISTS "scannedByUserId" TEXT;
ALTER TABLE "InventoryLine" ADD COLUMN IF NOT EXISTS "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "InventoryLine_scannedAt_idx" ON "InventoryLine"("scannedAt");

CREATE TABLE IF NOT EXISTS "InventoryPhoto" (
    "id" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "publicUrl" TEXT NOT NULL,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    CONSTRAINT "InventoryPhoto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InventoryPhoto_inventoryItemId_idx" ON "InventoryPhoto"("inventoryItemId");
CREATE INDEX IF NOT EXISTS "InventoryPhoto_createdAt_idx" ON "InventoryPhoto"("createdAt");

CREATE TABLE IF NOT EXISTS "InventoryAuditLog" (
    "id" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "userId" TEXT,
    "userEmail" TEXT,
    "action" TEXT NOT NULL,
    "fieldName" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InventoryAuditLog_inventoryId_createdAt_idx" ON "InventoryAuditLog"("inventoryId", "createdAt");
CREATE INDEX IF NOT EXISTS "InventoryAuditLog_inventoryItemId_idx" ON "InventoryAuditLog"("inventoryItemId");
CREATE INDEX IF NOT EXISTS "InventoryAuditLog_userId_createdAt_idx" ON "InventoryAuditLog"("userId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "InventoryPhoto" ADD CONSTRAINT "InventoryPhoto_inventoryItemId_fkey"
    FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "InventoryAuditLog" ADD CONSTRAINT "InventoryAuditLog_inventoryId_fkey"
    FOREIGN KEY ("inventoryId") REFERENCES "InventorySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "InventoryAuditLog" ADD CONSTRAINT "InventoryAuditLog_inventoryItemId_fkey"
    FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Backfill scannedAt depuis createdAt pour les lignes existantes
UPDATE "InventoryLine" SET "scannedAt" = "createdAt" WHERE "scannedAt" IS NULL;
