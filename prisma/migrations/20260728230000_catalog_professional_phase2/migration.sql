-- Phase 2 catalogue professionnel All Vap's — additive

-- ProductRange
CREATE TABLE IF NOT EXISTS "ProductRange" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductRange_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProductRange_brandId_slug_key" ON "ProductRange"("brandId", "slug");
CREATE INDEX IF NOT EXISTS "ProductRange_brandId_sortOrder_idx" ON "ProductRange"("brandId", "sortOrder");

-- ProductImage
CREATE TABLE IF NOT EXISTS "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "alt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProductImage_productId_sortOrder_idx" ON "ProductImage"("productId", "sortOrder");
CREATE INDEX IF NOT EXISTS "ProductImage_status_idx" ON "ProductImage"("status");

-- ProductAvaMeta
CREATE TABLE IF NOT EXISTS "ProductAvaMeta" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "avaKeywords" TEXT,
    "avaDescription" TEXT,
    "avaRecommendations" TEXT,
    "avaSaveurs" TEXT,
    "avaSimilaires" TEXT,
    "avaQuestions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductAvaMeta_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProductAvaMeta_productId_key" ON "ProductAvaMeta"("productId");

-- Product extensions
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "reference" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "shortDescription" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "longDescription" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "rangeId" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "imageStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sumupName" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sumupReference" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sumupSku" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sumupMapping" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sumupLastSync" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Product_rangeId_idx" ON "Product"("rangeId");
CREATE INDEX IF NOT EXISTS "Product_reference_idx" ON "Product"("reference");
CREATE INDEX IF NOT EXISTS "Product_sumupSku_idx" ON "Product"("sumupSku");
CREATE INDEX IF NOT EXISTS "Product_sortOrder_idx" ON "Product"("sortOrder");
CREATE INDEX IF NOT EXISTS "Product_isActive_visibleOnline_category_idx" ON "Product"("isActive", "visibleOnline", "category");

-- ProductVariant extensions
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "pgRatio" INTEGER;
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "vgRatio" INTEGER;
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "pgVgLabel" TEXT;
CREATE INDEX IF NOT EXISTS "ProductVariant_nicotineMg_idx" ON "ProductVariant"("nicotineMg");
CREATE INDEX IF NOT EXISTS "ProductVariant_pgVgLabel_idx" ON "ProductVariant"("pgVgLabel");

-- ProductFlavor extensions
ALTER TABLE "ProductFlavor" ADD COLUMN IF NOT EXISTS "secondaryFlavor2" TEXT;
ALTER TABLE "ProductFlavor" ADD COLUMN IF NOT EXISTS "flavors" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ProductFlavor" ADD COLUMN IF NOT EXISTS "searchKeywords" TEXT;
ALTER TABLE "ProductFlavor" ADD COLUMN IF NOT EXISTS "isSweet" BOOLEAN;
ALTER TABLE "ProductFlavor" ADD COLUMN IF NOT EXISTS "isSour" BOOLEAN;
ALTER TABLE "ProductFlavor" ADD COLUMN IF NOT EXISTS "isCandy" BOOLEAN;
ALTER TABLE "ProductFlavor" ADD COLUMN IF NOT EXISTS "freshnessLevel" TEXT;
ALTER TABLE "ProductFlavor" ADD COLUMN IF NOT EXISTS "intensity" TEXT;
CREATE INDEX IF NOT EXISTS "ProductFlavor_primaryFlavor_idx" ON "ProductFlavor"("primaryFlavor");

-- FK constraints
DO $$ BEGIN
  ALTER TABLE "ProductRange" ADD CONSTRAINT "ProductRange_brandId_fkey"
    FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ProductAvaMeta" ADD CONSTRAINT "ProductAvaMeta_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Product" ADD CONSTRAINT "Product_rangeId_fkey"
    FOREIGN KEY ("rangeId") REFERENCES "ProductRange"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
