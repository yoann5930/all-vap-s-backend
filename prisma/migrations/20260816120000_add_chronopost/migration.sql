-- Additive only. Does not rewrite existing delivery methods.
ALTER TYPE "DeliveryMethod" ADD VALUE IF NOT EXISTS 'CHRONOPOST';
