-- Tables attendues par lib/audit/mode.ts (mode AUDIT_ONLY, aucun paiement réel)
CREATE TABLE IF NOT EXISTS "AppSetting" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "valueJson" JSONB NOT NULL,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AppSetting_key_key" ON "AppSetting"("key");

CREATE TABLE IF NOT EXISTS "AuditModeLog" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorUserId" TEXT,
  "allowOutOfStock" BOOLEAN NOT NULL DEFAULT false,
  "expiresAt" TIMESTAMP(3),
  "metaJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditModeLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuditModeLog_campaignId_createdAt_idx"
  ON "AuditModeLog"("campaignId", "createdAt");
