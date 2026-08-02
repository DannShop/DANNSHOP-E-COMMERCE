-- AlterTable
ALTER TABLE `deposit` ADD COLUMN `fee` BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN `paymentMethod` VARCHAR(191) NULL,
    ADD COLUMN `totalPaid` BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN `uniqueCode` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `order` ADD COLUMN `fee` BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN `paymentMethod` VARCHAR(191) NULL,
    ADD COLUMN `uniqueCode` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `PaymentMethodConfig` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `logoUrl` VARCHAR(191) NULL,
    `feeFlat` BIGINT NOT NULL DEFAULT 0,
    `feePercent` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PaymentMethodConfig_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
