-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('market', 'limit');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('open', 'partial', 'filled', 'canceled');

-- AlterTable
ALTER TABLE "User" DROP COLUMN "orders";

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "symbol" TEXT NOT NULL,
    "side" "Side" NOT NULL,
    "type" "OrderType" NOT NULL DEFAULT 'limit',
    "price" DOUBLE PRECISION NOT NULL,
    "size" DOUBLE PRECISION NOT NULL,
    "filled" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "OrderStatus" NOT NULL DEFAULT 'open',
    "house" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Order_symbol_side_status_price_idx" ON "Order"("symbol", "side", "status", "price");

-- CreateIndex
CREATE INDEX "Order_userId_status_idx" ON "Order"("userId", "status");

-- CreateIndex
CREATE INDEX "Order_house_status_idx" ON "Order"("house", "status");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "MarketData"("symbol") ON DELETE CASCADE ON UPDATE CASCADE;
