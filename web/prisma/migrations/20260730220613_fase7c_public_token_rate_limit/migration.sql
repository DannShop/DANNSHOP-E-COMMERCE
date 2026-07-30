-- AlterTable
ALTER TABLE `Order` ADD COLUMN `publicToken` VARCHAR(191) NOT NULL;

-- CreateTable
CREATE TABLE `RateLimit` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `windowStart` DATETIME(3) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 1,

    UNIQUE INDEX `RateLimit_key_key`(`key`),
    INDEX `RateLimit_windowStart_idx`(`windowStart`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Order_publicToken_key` ON `Order`(`publicToken`);

-- CreateIndex
CREATE INDEX `Order_publicToken_idx` ON `Order`(`publicToken`);
