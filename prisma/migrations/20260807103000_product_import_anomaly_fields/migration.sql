-- Colonnes Product présentes dans schema.prisma mais absentes de certaines bases prod.
-- Cause du 500 inventaire : prisma.product.findUnique() lit importAnomaly → colonne manquante.
-- Idempotent (IF NOT EXISTS).

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "importAnomaly" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "lastCatalogImportAt" TIMESTAMP(3);
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "volumeMl" INTEGER;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "promotion10mlEligible" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Product_lastCatalogImportAt_idx" ON "Product"("lastCatalogImportAt");
CREATE INDEX IF NOT EXISTS "Product_volumeMl_idx" ON "Product"("volumeMl");
CREATE INDEX IF NOT EXISTS "Product_promotion10mlEligible_idx" ON "Product"("promotion10mlEligible");
CREATE INDEX IF NOT EXISTS "Product_productFamily_idx" ON "Product"("productFamily");
