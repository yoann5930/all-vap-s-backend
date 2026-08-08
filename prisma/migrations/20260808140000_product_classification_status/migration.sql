-- Additive classification fields (no stock changes)
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "classificationStatus" TEXT NOT NULL DEFAULT 'UNCLASSIFIED';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "classificationSources" TEXT;
CREATE INDEX IF NOT EXISTS "Product_classificationStatus_idx" ON "Product"("classificationStatus");
