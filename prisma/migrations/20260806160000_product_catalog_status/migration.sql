-- AlterTable: cycle de vie catalogue (site local) — compatible inventaire
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "catalogStatus" TEXT NOT NULL DEFAULT 'a_verifier';
CREATE INDEX IF NOT EXISTS "Product_catalogStatus_idx" ON "Product"("catalogStatus");
