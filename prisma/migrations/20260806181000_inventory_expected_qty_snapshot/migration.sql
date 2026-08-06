-- AlterTable: snapshot stock théorique au moment du comptage
ALTER TABLE "InventoryLine" ADD COLUMN IF NOT EXISTS "expectedQuantitySnapshot" INTEGER;
