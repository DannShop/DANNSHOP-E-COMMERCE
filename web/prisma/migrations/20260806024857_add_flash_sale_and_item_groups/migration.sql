-- AlterTable
ALTER TABLE `productitem` ADD COLUMN `flashEndAt` DATETIME(3) NULL,
    ADD COLUMN `flashPrice` BIGINT NULL,
    ADD COLUMN `flashStartAt` DATETIME(3) NULL,
    ADD COLUMN `groupId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `ProductItemGroup` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ProductItemGroup_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `ProductItem_groupId_idx` ON `ProductItem`(`groupId`);

-- AddForeignKey
ALTER TABLE `ProductItem` ADD CONSTRAINT `ProductItem_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `ProductItemGroup`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductItemGroup` ADD CONSTRAINT `ProductItemGroup_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
