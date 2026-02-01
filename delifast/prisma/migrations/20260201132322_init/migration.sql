-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreSettings" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "delifastUsername" TEXT,
    "delifastPassword" TEXT,
    "delifastCustomerId" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'manual',
    "autoSendStatus" TEXT NOT NULL DEFAULT 'paid',
    "senderNo" TEXT,
    "senderName" TEXT,
    "senderAddress" TEXT,
    "senderMobile" TEXT,
    "senderCityId" INTEGER,
    "senderAreaId" INTEGER,
    "defaultWeight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "defaultDimensions" TEXT NOT NULL DEFAULT '10x10x10',
    "defaultCityId" INTEGER NOT NULL DEFAULT 5,
    "paymentMethodId" INTEGER NOT NULL DEFAULT 0,
    "feesOnSender" BOOLEAN NOT NULL DEFAULT true,
    "feesPaid" BOOLEAN NOT NULL DEFAULT true,
    "apiToken" TEXT,
    "tokenExpiry" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "shopifyOrderNumber" TEXT NOT NULL,
    "shipmentId" TEXT,
    "isTemporaryId" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'new',
    "statusDetails" TEXT,
    "lookupAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastLookupAt" TIMESTAMP(3),
    "nextLookupAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Log" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "context" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_shop_idx" ON "Session"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "StoreSettings_shop_key" ON "StoreSettings"("shop");

-- CreateIndex
CREATE INDEX "Shipment_shop_status_idx" ON "Shipment"("shop", "status");

-- CreateIndex
CREATE INDEX "Shipment_isTemporaryId_idx" ON "Shipment"("isTemporaryId");

-- CreateIndex
CREATE INDEX "Shipment_status_idx" ON "Shipment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_shop_shopifyOrderId_key" ON "Shipment"("shop", "shopifyOrderId");

-- CreateIndex
CREATE INDEX "Log_shop_level_idx" ON "Log"("shop", "level");

-- CreateIndex
CREATE INDEX "Log_createdAt_idx" ON "Log"("createdAt");

-- CreateIndex
CREATE INDEX "Log_shop_createdAt_idx" ON "Log"("shop", "createdAt");

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_shop_fkey" FOREIGN KEY ("shop") REFERENCES "StoreSettings"("shop") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Log" ADD CONSTRAINT "Log_shop_fkey" FOREIGN KEY ("shop") REFERENCES "StoreSettings"("shop") ON DELETE RESTRICT ON UPDATE CASCADE;
