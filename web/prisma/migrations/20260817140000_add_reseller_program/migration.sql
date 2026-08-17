-- Program reseller.
--
-- SELURUHNYA TABEL BARU — nol ALTER pada tabel yang sudah ada, jadi deploy-nya
-- nol perubahan perilaku. Tidak ada satu pun baris reseller sampai orang
-- pertama mendaftar, dan tanpa baris itu getMembershipContext() menjawab persis
-- seperti sebelumnya (tidak ada tier = harga normal).
--
-- Catatan tentang paket "gratis": SENGAJA tidak diwujudkan sebagai baris apa
-- pun. Reseller gratis = punya ResellerAccount dengan tierId NULL. Lihat
-- komentar panjang di schema.prisma soal kenapa mewujudkannya sebagai
-- keanggotaan berumur panjang justru mematikan diskon paket berbayar.
--
-- Diverifikasi identik dengan keluaran:
--   prisma migrate diff --from-schema-datamodel <skema sebelum> --to-schema-datamodel prisma/schema.prisma --script

-- CreateTable
CREATE TABLE `ResellerAccount` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `businessName` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `referralCode` VARCHAR(191) NULL,
    `tierId` VARCHAR(191) NULL,
    `tierPricePaid` BIGINT NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `activatedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ResellerAccount_userId_key`(`userId`),
    INDEX `ResellerAccount_tierId_idx`(`tierId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ResellerActivationToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ResellerActivationToken_tokenHash_key`(`tokenHash`),
    INDEX `ResellerActivationToken_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TierPurchase` (
    `id` VARCHAR(191) NOT NULL,
    `resellerId` VARCHAR(191) NOT NULL,
    `tierId` VARCHAR(191) NOT NULL,
    `fromTierId` VARCHAR(191) NULL,
    `tierPrice` BIGINT NOT NULL,
    `creditApplied` BIGINT NOT NULL DEFAULT 0,
    `fee` BIGINT NOT NULL DEFAULT 0,
    `uniqueCode` INTEGER NOT NULL DEFAULT 0,
    `totalPaid` BIGINT NOT NULL,
    `paymentMethod` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'PAID', 'EXPIRED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `paymentRef` VARCHAR(191) NULL,
    `rawResponse` JSON NULL,
    `expiredAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TierPurchase_resellerId_status_idx`(`resellerId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ResellerAccount` ADD CONSTRAINT `ResellerAccount_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ResellerAccount` ADD CONSTRAINT `ResellerAccount_tierId_fkey` FOREIGN KEY (`tierId`) REFERENCES `MembershipTier`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ResellerActivationToken` ADD CONSTRAINT `ResellerActivationToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TierPurchase` ADD CONSTRAINT `TierPurchase_resellerId_fkey` FOREIGN KEY (`resellerId`) REFERENCES `ResellerAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TierPurchase` ADD CONSTRAINT `TierPurchase_tierId_fkey` FOREIGN KEY (`tierId`) REFERENCES `MembershipTier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

