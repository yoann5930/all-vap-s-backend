-- Emplacement inventaire : STOCK | VITRINE
ALTER TABLE "InventoryLine" ADD COLUMN IF NOT EXISTS "placement" TEXT NOT NULL DEFAULT 'STOCK';
CREATE INDEX IF NOT EXISTS "InventoryLine_placement_idx" ON "InventoryLine"("placement");
