-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `role` ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'USER',
    `emailVerifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Wallet` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `balance` BIGINT NOT NULL DEFAULT 0,

    UNIQUE INDEX `Wallet_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WalletLedger` (
    `id` VARCHAR(191) NOT NULL,
    `walletId` VARCHAR(191) NOT NULL,
    `type` ENUM('DEPOSIT', 'ORDER_PAYMENT', 'REFUND', 'ADJUSTMENT') NOT NULL,
    `amount` BIGINT NOT NULL,
    `balanceAfter` BIGINT NOT NULL,
    `referenceType` VARCHAR(191) NOT NULL,
    `referenceId` VARCHAR(191) NOT NULL,
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `note` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `WalletLedger_idempotencyKey_key`(`idempotencyKey`),
    INDEX `WalletLedger_walletId_createdAt_idx`(`walletId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Deposit` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `amount` BIGINT NOT NULL,
    `status` ENUM('PENDING', 'PAID', 'EXPIRED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `paymentRef` VARCHAR(191) NULL,
    `rawResponse` JSON NULL,
    `expiredAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Category` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `Category_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Product` (
    `id` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `publisher` VARCHAR(191) NULL,
    `banner` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT false,
    `inputFields` JSON NOT NULL,
    `nicknameCheckKey` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Product_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductItem` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `sellingPrice` BIGINT NOT NULL,
    `memberPrice` BIGINT NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProviderSku` (
    `id` VARCHAR(191) NOT NULL,
    `productItemId` VARCHAR(191) NOT NULL,
    `provider` ENUM('DIGIFLAZZ', 'OKECONNECT', 'QIOSPAY', 'SERPUL') NOT NULL,
    `providerSkuCode` VARCHAR(191) NOT NULL,
    `costPrice` BIGINT NOT NULL,
    `status` ENUM('ACTIVE', 'UNAVAILABLE') NOT NULL DEFAULT 'ACTIVE',
    `lastSyncedAt` DATETIME(3) NULL,

    INDEX `ProviderSku_provider_providerSkuCode_idx`(`provider`, `providerSkuCode`),
    UNIQUE INDEX `ProviderSku_productItemId_provider_key`(`productItemId`, `provider`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Order` (
    `id` VARCHAR(191) NOT NULL,
    `orderNumber` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING_PAYMENT', 'PAID', 'PROCESSING', 'COMPLETED', 'EXPIRED', 'FAILED', 'REFUND_PENDING', 'REFUNDED', 'NEEDS_REVIEW') NOT NULL DEFAULT 'PENDING_PAYMENT',
    `userId` VARCHAR(191) NULL,
    `productItemId` VARCHAR(191) NULL,
    `productName` VARCHAR(191) NOT NULL,
    `itemName` VARCHAR(191) NOT NULL,
    `target` JSON NOT NULL,
    `buyerEmail` VARCHAR(191) NULL,
    `buyerPhone` VARCHAR(191) NULL,
    `paidVia` ENUM('MIDTRANS', 'BALANCE') NULL,
    `sellingPrice` BIGINT NOT NULL,
    `total` BIGINT NOT NULL,
    `expiredAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Order_orderNumber_key`(`orderNumber`),
    INDEX `Order_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderPayment` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `method` VARCHAR(191) NOT NULL,
    `paymentRef` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'PAID', 'EXPIRED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `actions` JSON NULL,
    `rawResponse` JSON NULL,
    `expiredAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `OrderPayment_orderId_key`(`orderId`),
    INDEX `OrderPayment_paymentRef_idx`(`paymentRef`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderFulfillment` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `attemptNo` INTEGER NOT NULL,
    `provider` ENUM('DIGIFLAZZ', 'OKECONNECT', 'QIOSPAY', 'SERPUL') NOT NULL,
    `providerSkuCode` VARCHAR(191) NOT NULL,
    `costPrice` BIGINT NOT NULL,
    `ourRefId` VARCHAR(191) NOT NULL,
    `providerRef` VARCHAR(191) NULL,
    `status` ENUM('SENT', 'PROCESSING', 'SUCCESS', 'FAILED') NOT NULL DEFAULT 'SENT',
    `sn` VARCHAR(191) NULL,
    `message` VARCHAR(191) NULL,
    `rawCallback` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `OrderFulfillment_ourRefId_key`(`ourRefId`),
    UNIQUE INDEX `OrderFulfillment_orderId_attemptNo_key`(`orderId`, `attemptNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderStatusHistory` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `fromStatus` ENUM('PENDING_PAYMENT', 'PAID', 'PROCESSING', 'COMPLETED', 'EXPIRED', 'FAILED', 'REFUND_PENDING', 'REFUNDED', 'NEEDS_REVIEW') NULL,
    `toStatus` ENUM('PENDING_PAYMENT', 'PAID', 'PROCESSING', 'COMPLETED', 'EXPIRED', 'FAILED', 'REFUND_PENDING', 'REFUNDED', 'NEEDS_REVIEW') NOT NULL,
    `note` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProviderConfig` (
    `id` VARCHAR(191) NOT NULL,
    `key` ENUM('DIGIFLAZZ', 'OKECONNECT', 'QIOSPAY', 'SERPUL') NOT NULL,
    `displayName` VARCHAR(191) NOT NULL,
    `credentials` JSON NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT false,
    `priority` INTEGER NOT NULL DEFAULT 100,
    `balance` BIGINT NOT NULL DEFAULT 0,
    `healthStatus` ENUM('UNKNOWN', 'HEALTHY', 'DEGRADED', 'DOWN') NOT NULL DEFAULT 'UNKNOWN',
    `lastHealthCheckAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProviderConfig_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProviderBalanceLog` (
    `id` VARCHAR(191) NOT NULL,
    `providerId` VARCHAR(191) NOT NULL,
    `balance` BIGINT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PriceSyncLog` (
    `id` VARCHAR(191) NOT NULL,
    `provider` ENUM('DIGIFLAZZ', 'OKECONNECT', 'QIOSPAY', 'SERPUL') NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `skusUpdated` INTEGER NOT NULL DEFAULT 0,
    `skusMissing` INTEGER NOT NULL DEFAULT 0,
    `result` VARCHAR(191) NULL,
    `error` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Job` (
    `id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `payload` JSON NOT NULL,
    `runAt` DATETIME(3) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `maxAttempts` INTEGER NOT NULL DEFAULT 5,
    `status` ENUM('PENDING', 'RUNNING', 'DONE', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `lastError` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Job_status_runAt_idx`(`status`, `runAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdminActionLog` (
    `id` VARCHAR(191) NOT NULL,
    `adminId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `targetType` VARCHAR(191) NULL,
    `targetId` VARCHAR(191) NULL,
    `detail` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WebhookEvent` (
    `id` VARCHAR(191) NOT NULL,
    `source` VARCHAR(191) NOT NULL,
    `externalRef` VARCHAR(191) NULL,
    `eventKey` VARCHAR(191) NULL,
    `rawBody` TEXT NOT NULL,
    `headers` JSON NOT NULL,
    `processedAt` DATETIME(3) NULL,
    `processResult` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `WebhookEvent_eventKey_key`(`eventKey`),
    INDEX `WebhookEvent_source_externalRef_idx`(`source`, `externalRef`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Wallet` ADD CONSTRAINT `Wallet_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WalletLedger` ADD CONSTRAINT `WalletLedger_walletId_fkey` FOREIGN KEY (`walletId`) REFERENCES `Wallet`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Deposit` ADD CONSTRAINT `Deposit_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductItem` ADD CONSTRAINT `ProductItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProviderSku` ADD CONSTRAINT `ProviderSku_productItemId_fkey` FOREIGN KEY (`productItemId`) REFERENCES `ProductItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderPayment` ADD CONSTRAINT `OrderPayment_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderFulfillment` ADD CONSTRAINT `OrderFulfillment_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderStatusHistory` ADD CONSTRAINT `OrderStatusHistory_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProviderBalanceLog` ADD CONSTRAINT `ProviderBalanceLog_providerId_fkey` FOREIGN KEY (`providerId`) REFERENCES `ProviderConfig`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AdminActionLog` ADD CONSTRAINT `AdminActionLog_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
