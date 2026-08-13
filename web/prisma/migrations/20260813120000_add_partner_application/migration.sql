-- Pengajuan kemitraan H2H + kontrol katalog mitra.
--
-- Ditulis TANGAN (bukan hasil `prisma migrate dev`) sesuai pembagian kerja repo ini:
-- perintah Prisma yang menyentuh database dijalankan user, bukan agen.

-- Antrean pengajuan mitra. Formnya hanya bisa diakses dari dalam panel user
-- (/account/mitra), jadi setiap baris di sini dijamin milik member terdaftar.
CREATE TABLE `PartnerApplication` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `businessName` VARCHAR(191) NOT NULL,
    `businessType` ENUM('PERORANGAN', 'CV', 'PT', 'KOPERASI', 'LAINNYA') NOT NULL DEFAULT 'PERORANGAN',
    `businessCity` VARCHAR(191) NOT NULL,
    `websiteUrl` TEXT NULL,
    `picName` VARCHAR(191) NOT NULL,
    `picPhone` VARCHAR(191) NOT NULL,
    `picRole` VARCHAR(191) NULL,
    `platform` VARCHAR(191) NULL,
    `serverIps` TEXT NULL,
    `callbackUrl` TEXT NULL,
    `monthlyVolume` VARCHAR(191) NOT NULL,
    `notes` TEXT NULL,
    `reviewedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `reviewNote` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PartnerApplication_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `PartnerApplication_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Tautan balik dari akun partner ke pengajuan yang melahirkannya. NULL untuk
-- partner yang dibuat admin langsung lewat /admin/partners (jalur lama).
ALTER TABLE `PartnerAccount` ADD COLUMN `applicationId` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `PartnerAccount_applicationId_key` ON `PartnerAccount`(`applicationId`);

ALTER TABLE `PartnerApplication` ADD CONSTRAINT `PartnerApplication_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `PartnerAccount` ADD CONSTRAINT `PartnerAccount_applicationId_fkey`
    FOREIGN KEY (`applicationId`) REFERENCES `PartnerApplication`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Kontrol katalog mitra. DEFAULT true = nol perubahan perilaku saat deploy:
-- semua produk yang sekarang muncul di /api/v1/price-list tetap muncul, dan
-- admin mematikannya satu per satu kalau memang perlu.
ALTER TABLE `Product` ADD COLUMN `partnerVisible` BOOLEAN NOT NULL DEFAULT true;
