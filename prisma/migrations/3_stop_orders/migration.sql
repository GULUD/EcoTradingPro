-- Stop orders are schedule rows that fire once the market reaches the trigger level
ALTER TYPE "OrderType" ADD VALUE IF NOT EXISTS 'stop_loss';
ALTER TYPE "OrderType" ADD VALUE IF NOT EXISTS 'stop_limit';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'triggered';

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "triggerPrice" DOUBLE PRECISION;
