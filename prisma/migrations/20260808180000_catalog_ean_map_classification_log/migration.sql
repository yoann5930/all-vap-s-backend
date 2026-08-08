-- Mémoire EAN + journal classification (additif, zéro impact stocks)
CREATE TABLE IF NOT EXISTS "CatalogEanMap" (
  "id" TEXT PRIMARY KEY,
  "ean" TEXT NOT NULL UNIQUE,
  "productId" TEXT NOT NULL,
  "manufacturerId" TEXT,
  "rangeId" TEXT,
  "category" TEXT,
  "confidence" TEXT NOT NULL DEFAULT 'A_VALIDER',
  "source" TEXT NOT NULL DEFAULT 'inventory_scan',
  "validatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CatalogEanMap_productId_idx" ON "CatalogEanMap"("productId");
CREATE INDEX IF NOT EXISTS "CatalogEanMap_confidence_idx" ON "CatalogEanMap"("confidence");

CREATE TABLE IF NOT EXISTS "ClassificationChangeLog" (
  "id" TEXT PRIMARY KEY,
  "productId" TEXT NOT NULL,
  "ean" TEXT,
  "oldManufacturerId" TEXT,
  "newManufacturerId" TEXT,
  "oldRangeId" TEXT,
  "newRangeId" TEXT,
  "reason" TEXT NOT NULL,
  "confidence" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ClassificationChangeLog_productId_idx" ON "ClassificationChangeLog"("productId");
CREATE INDEX IF NOT EXISTS "ClassificationChangeLog_createdAt_idx" ON "ClassificationChangeLog"("createdAt");
CREATE INDEX IF NOT EXISTS "ClassificationChangeLog_confidence_idx" ON "ClassificationChangeLog"("confidence");
