-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."Side" AS ENUM ('buy', 'sell');

-- CreateEnum
CREATE TYPE "public"."TradeSource" AS ENUM ('user', 'bot');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 10000,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "portfolio" JSONB NOT NULL DEFAULT '{}',
    "orders" JSONB NOT NULL DEFAULT '[]',
    "watchlist" JSONB NOT NULL DEFAULT '[]',
    "priceAlerts" JSONB NOT NULL DEFAULT '[]',
    "tradingBots" JSONB NOT NULL DEFAULT '[]',
    "competitions" JSONB NOT NULL DEFAULT '[]',
    "socialTrading" JSONB NOT NULL DEFAULT '{}',
    "apiKeys" JSONB NOT NULL DEFAULT '[]',
    "lastLogin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Admin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT 'admin',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "lastLogin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MarketData" (
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "manualPrice" DOUBLE PRECISION,
    "autoSync" BOOLEAN NOT NULL DEFAULT true,
    "volatility" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "decimals" INTEGER NOT NULL DEFAULT 2,
    "open24h" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "change24h" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "volume24h" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "delisted" BOOLEAN NOT NULL DEFAULT false,
    "delistedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketData_pkey" PRIMARY KEY ("symbol")
);

-- CreateTable
CREATE TABLE "public"."Trade" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "symbol" TEXT NOT NULL,
    "side" "public"."Side" NOT NULL,
    "size" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "pnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source" "public"."TradeSource" NOT NULL DEFAULT 'user',
    "botName" TEXT,
    "time" BIGINT NOT NULL,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "balanceBefore" DOUBLE PRECISION NOT NULL,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "operator" TEXT,
    "fromUserId" TEXT,
    "toUserId" TEXT,
    "ts" BIGINT NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."News" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "author" TEXT,
    "category" TEXT,
    "source" TEXT,
    "imageUrl" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "News_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "type" TEXT NOT NULL DEFAULT 'info',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "targetUsers" TEXT NOT NULL DEFAULT 'all',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "public"."User"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "public"."Admin"("email");

-- CreateIndex
CREATE INDEX "MarketData_delisted_idx" ON "public"."MarketData"("delisted");

-- CreateIndex
CREATE INDEX "Trade_symbol_time_idx" ON "public"."Trade"("symbol", "time");

-- CreateIndex
CREATE INDEX "Trade_userId_time_idx" ON "public"."Trade"("userId", "time");

-- CreateIndex
CREATE INDEX "Transaction_userId_ts_idx" ON "public"."Transaction"("userId", "ts");

-- CreateIndex
CREATE INDEX "Transaction_type_idx" ON "public"."Transaction"("type");

-- CreateIndex
CREATE INDEX "News_isPublished_publishedAt_idx" ON "public"."News"("isPublished", "publishedAt");

-- AddForeignKey
ALTER TABLE "public"."Trade" ADD CONSTRAINT "Trade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Trade" ADD CONSTRAINT "Trade_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "public"."MarketData"("symbol") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
