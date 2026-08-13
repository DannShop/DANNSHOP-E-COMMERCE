-- API Partner (H2H reseller) — lihat web/src/content/api-partner.md.
--
-- Ditulis TANGAN (bukan hasil `prisma migrate dev`) sesuai pembagian kerja repo ini:
-- perintah Prisma yang menyentuh database dijalankan user, bukan agen.

-- Kredensial & konfigurasi satu partner reseller.
-- apiKeyEnc/callbackSecretEnc = AES-256-GCM (lib/crypto.ts), BUKAN hash — skema
-- tanda tangan md5(username+apiKey+ref_id) mengharuskan server membaca kembali
-- apiKey aslinya untuk menghitung ulang hash yang sama.
CREATE TABLE `PartnerAccount` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `apiKeyEnc` TEXT NOT NULL,
    `callbackUrl` TEXT NULL,
    `callbackSecretEnc` TEXT NULL,
    `ipWhitelist` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastUsedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PartnerAccount_userId_key`(`userId`),
    UNIQUE INDEX `PartnerAccount_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Jejak partner pada order. Keduanya NULL untuk seluruh order storefront yang
-- sudah ada, jadi migrasi ini nol dampak pada data lama.
ALTER TABLE `Order` ADD COLUMN `partnerId` VARCHAR(191) NULL,
                    ADD COLUMN `partnerRefId` VARCHAR(191) NULL;

-- Penjamin idempotensi API partner: ref_id yang sama dari partner yang sama
-- tidak akan pernah menghasilkan order kedua (= debit saldo ganda).
-- MySQL/TiDB mengizinkan banyak baris NULL di unique index, jadi order non-partner
-- (partnerId NULL) tidak saling bentrok.
CREATE UNIQUE INDEX `Order_partnerId_partnerRefId_key` ON `Order`(`partnerId`, `partnerRefId`);
CREATE INDEX `Order_partnerId_createdAt_idx` ON `Order`(`partnerId`, `createdAt`);

ALTER TABLE `PartnerAccount` ADD CONSTRAINT `PartnerAccount_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Order` ADD CONSTRAINT `Order_partnerId_fkey`
    FOREIGN KEY (`partnerId`) REFERENCES `PartnerAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
