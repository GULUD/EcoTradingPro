-- CreateEnum
CREATE TYPE "MerchantStatus" AS ENUM ('pending', 'approved', 'rejected', 'suspended');

-- CreateEnum
CREATE TYPE "GuluOpType" AS ENUM ('mint', 'burn');

-- CreateEnum
CREATE TYPE "P2PSide" AS ENUM ('buy', 'sell');

-- CreateEnum
CREATE TYPE "P2POrderStatus" AS ENUM ('pending_payment', 'paid', 'completed', 'cancelled', 'disputed');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "locked" DOUBLE PRECISION NOT NULL DEFAULT 0,
ALTER COLUMN "balance" SET DEFAULT 0;

-- CreateTable
CREATE TABLE "GuluIssue" (
    "id" TEXT NOT NULL,
    "type" "GuluOpType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "userId" TEXT,
    "operator" TEXT NOT NULL,
    "note" TEXT,
    "ts" BIGINT NOT NULL,

    CONSTRAINT "GuluIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "contact" TEXT,
    "status" "MerchantStatus" NOT NULL DEFAULT 'pending',
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "maxOrderGulu" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "dailyLimitGulu" DOUBLE PRECISION NOT NULL DEFAULT 5000,
    "completedOrders" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "P2PAd" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "side" "P2PSide" NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "fiat" TEXT NOT NULL DEFAULT 'CNY',
    "minAmount" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "maxAmount" DOUBLE PRECISION NOT NULL DEFAULT 10000,
    "available" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentMethods" JSONB NOT NULL DEFAULT '[]',
    "terms" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "autoRelease" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "P2PAd_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "P2POrder" (
    "id" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "fiatAmount" DOUBLE PRECISION NOT NULL,
    "fiat" TEXT NOT NULL DEFAULT 'CNY',
    "status" "P2POrderStatus" NOT NULL DEFAULT 'pending_payment',
    "paymentMethod" TEXT,
    "paymentRef" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "P2POrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuluIssue_ts_idx" ON "GuluIssue"("ts");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_userId_key" ON "Merchant"("userId");

-- CreateIndex
CREATE INDEX "Merchant_status_idx" ON "Merchant"("status");

-- CreateIndex
CREATE INDEX "P2PAd_status_side_idx" ON "P2PAd"("status", "side");

-- CreateIndex
CREATE INDEX "P2PAd_merchantId_idx" ON "P2PAd"("merchantId");

-- CreateIndex
CREATE INDEX "P2POrder_buyerId_createdAt_idx" ON "P2POrder"("buyerId", "createdAt");

-- CreateIndex
CREATE INDEX "P2POrder_sellerId_createdAt_idx" ON "P2POrder"("sellerId", "createdAt");

-- CreateIndex
CREATE INDEX "P2POrder_status_paidAt_idx" ON "P2POrder"("status", "paidAt");

-- AddForeignKey
ALTER TABLE "GuluIssue" ADD CONSTRAINT "GuluIssue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Merchant" ADD CONSTRAINT "Merchant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "P2PAd" ADD CONSTRAINT "P2PAd_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "P2POrder" ADD CONSTRAINT "P2POrder_adId_fkey" FOREIGN KEY ("adId") REFERENCES "P2PAd"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "P2POrder" ADD CONSTRAINT "P2POrder_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "P2POrder" ADD CONSTRAINT "P2POrder_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

