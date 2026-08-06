-- AlterTable: anti double application stock inventaire (additif, non destructif)
ALTER TABLE "InventorySession" ADD COLUMN IF NOT EXISTS "stockAppliedAt" TIMESTAMP(3);
ALTER TABLE "InventorySession" ADD COLUMN IF NOT EXISTS "stockAppliedByUserId" TEXT;
CREATE INDEX IF NOT EXISTS "InventorySession_stockAppliedAt_idx" ON "InventorySession"("stockAppliedAt");
