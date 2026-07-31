-- CreateTable
CREATE TABLE `ProviderPriceListCache` (
    `id` VARCHAR(191) NOT NULL,
    `provider` ENUM('DIGIFLAZZ', 'OKECONNECT', 'QIOSPAY', 'SERPUL') NOT NULL,
    `skuCode` VARCHAR(191) NOT NULL,
    `productName` VARCHAR(191) NOT NULL,
    `brand` VARCHAR(191) NOT NULL,
    `costPrice` BIGINT NOT NULL,
    `available` BOOLEAN NOT NULL,
    `syncedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProviderPriceListCache_provider_productName_idx`(`provider`, `productName`),
    UNIQUE INDEX `ProviderPriceListCache_provider_skuCode_key`(`provider`, `skuCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
