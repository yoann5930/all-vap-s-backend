-- Conversations + messages + mémoires + OWNER identities (A.V.A. cœur)
CREATE TABLE IF NOT EXISTS "AvaConversation" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "surface" TEXT NOT NULL,
  "title" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AvaConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AvaChatMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ok',
  "errorCode" TEXT,
  "linksJson" JSONB,
  "metaJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AvaChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AvaMemoryEntry" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL DEFAULT '',
  "key" TEXT NOT NULL,
  "valueJson" JSONB NOT NULL,
  "source" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AvaMemoryEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AvaOwnerIdentity" (
  "id" TEXT NOT NULL,
  "primaryEmail" TEXT NOT NULL,
  "userId" TEXT,
  "authorizedAliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdByUserId" TEXT,
  CONSTRAINT "AvaOwnerIdentity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AvaOwnerIdentity_primaryEmail_key" ON "AvaOwnerIdentity"("primaryEmail");
CREATE UNIQUE INDEX IF NOT EXISTS "AvaMemoryEntry_scope_ownerUserId_key_key" ON "AvaMemoryEntry"("scope", "ownerUserId", "key");
CREATE INDEX IF NOT EXISTS "AvaConversation_ownerUserId_surface_updatedAt_idx" ON "AvaConversation"("ownerUserId", "surface", "updatedAt");
CREATE INDEX IF NOT EXISTS "AvaChatMessage_conversationId_createdAt_idx" ON "AvaChatMessage"("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "AvaMemoryEntry_scope_ownerUserId_idx" ON "AvaMemoryEntry"("scope", "ownerUserId");

DO $$ BEGIN
  ALTER TABLE "AvaConversation" ADD CONSTRAINT "AvaConversation_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AvaChatMessage" ADD CONSTRAINT "AvaChatMessage_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "AvaConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed OWNER yoann@allvaps.fr (idempotent)
INSERT INTO "AvaOwnerIdentity" ("id", "primaryEmail", "verifiedAt", "createdAt", "updatedAt")
SELECT 'ava_owner_yoann', 'yoann@allvaps.fr', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "AvaOwnerIdentity" WHERE lower("primaryEmail") = 'yoann@allvaps.fr');
