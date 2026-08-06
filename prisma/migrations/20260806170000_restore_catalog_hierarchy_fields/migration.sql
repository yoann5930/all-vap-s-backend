-- Restore Prisma catalogue hierarchy fields already present on local/site DBs.
-- Idempotent: safe on inventaire DBs that may lack some columns.
ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "manufacturerId" TEXT;
ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "masterId" TEXT;
ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'a_verifier';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "manufacturerId" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "rangeId" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "collectionId" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "productFamily" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "catalogStatus" TEXT NOT NULL DEFAULT 'a_verifier';
