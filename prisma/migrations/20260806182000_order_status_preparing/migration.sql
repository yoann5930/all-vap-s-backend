-- Additive OrderStatus values (local site workflow) — non-destructive
DO $$ BEGIN
  ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PREPARING';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PREPARED';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'AT_RELAY';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
