-- Riwayat panggilan API keluar ke provider (request + respons mentah + error transport).
-- Tanpa foreign key ke Order/OrderFulfillment - lihat komentar model di schema.prisma:
-- penulisan log tidak boleh gagal gara-gara row induk, dan log harus tetap ada
-- walau order-nya dihapus.
CREATE TABLE `ProviderApiLog` (
    `id` VARCHAR(191) NOT NULL,
    `provider` ENUM('DIGIFLAZZ', 'OKECONNECT', 'QIOSPAY', 'SERPUL') NOT NULL,
    `operation` VARCHAR(191) NOT NULL,
    `endpoint` VARCHAR(191) NOT NULL,
    `outcome` VARCHAR(191) NOT NULL,
    `httpStatus` INTEGER NULL,
    `durationMs` INTEGER NOT NULL,
    `orderId` VARCHAR(191) NULL,
    `orderNumber` VARCHAR(191) NULL,
    `fulfillmentId` VARCHAR(191) NULL,
    `ourRefId` VARCHAR(191) NULL,
    `providerRc` VARCHAR(191) NULL,
    `message` TEXT NULL,
    `requestBody` JSON NOT NULL,
    `responseBody` JSON NULL,
    `responseText` TEXT NULL,
    `errorMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProviderApiLog_createdAt_idx`(`createdAt`),
    INDEX `ProviderApiLog_orderId_idx`(`orderId`),
    INDEX `ProviderApiLog_ourRefId_idx`(`ourRefId`),
    INDEX `ProviderApiLog_provider_outcome_createdAt_idx`(`provider`, `outcome`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
