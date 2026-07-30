-- AlterTable
-- publicToken punya @default(cuid()) di level Prisma Client saja (bukan
-- default MySQL asli - MySQL tidak punya fungsi cuid()), jadi kolom ini
-- ditambah nullable dulu, di-backfill per-baris dengan UUID() (unik per
-- baris, cukup utk baris lama yang tidak akan pernah lagi diakses lewat
-- publicToken generate-an lama), baru diketatkan jadi NOT NULL - supaya
-- migrasi ini aman dijalankan di database manapun yang sudah punya baris
-- Order, bukan cuma di dev DB yang kebetulan masih kosong.
ALTER TABLE `Order` ADD COLUMN `publicToken` VARCHAR(191) NULL;
UPDATE `Order` SET `publicToken` = UUID() WHERE `publicToken` IS NULL;
ALTER TABLE `Order` MODIFY COLUMN `publicToken` VARCHAR(191) NOT NULL;

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
