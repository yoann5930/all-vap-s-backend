-- AlterTable Order — champs mode AUDIT_ONLY (exclus du CA / stats A.V.A.)
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "isAudit" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "auditCampaignId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "auditAllowOutOfStock" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Order_isAudit_createdAt_idx" ON "Order"("isAudit", "createdAt");
