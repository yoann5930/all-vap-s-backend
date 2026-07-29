-- SumUp API sync — état curseur + transactions idempotentes
CREATE TABLE "SumUpSyncState" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "lastTransactionTime" TIMESTAMP(3),
    "lastTransactionId" TEXT,
    "lockedUntil" TIMESTAMP(3),
    "lockOwner" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SumUpSyncState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SumUpSyncedTransaction" (
    "id" TEXT NOT NULL,
    "sumupTransactionId" TEXT NOT NULL,
    "transactionCode" TEXT,
    "transactionType" TEXT NOT NULL,
    "processingStatus" TEXT NOT NULL DEFAULT 'applied',
    "syncRunId" TEXT,
    "linesProcessed" INTEGER NOT NULL DEFAULT 0,
    "linesSkipped" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SumUpSyncedTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SumUpSyncedTransaction_sumupTransactionId_key" ON "SumUpSyncedTransaction"("sumupTransactionId");
CREATE INDEX "SumUpSyncedTransaction_transactionCode_idx" ON "SumUpSyncedTransaction"("transactionCode");
CREATE INDEX "SumUpSyncedTransaction_syncRunId_idx" ON "SumUpSyncedTransaction"("syncRunId");
CREATE INDEX "SumUpSyncedTransaction_createdAt_idx" ON "SumUpSyncedTransaction"("createdAt");

ALTER TABLE "SumUpSyncedTransaction" ADD CONSTRAINT "SumUpSyncedTransaction_syncRunId_fkey" FOREIGN KEY ("syncRunId") REFERENCES "SyncRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "SumUpSyncState" ("id", "updatedAt") VALUES ('default', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
