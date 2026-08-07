-- Bagian A: tambah value MEMBERSHIP ke enum LedgerType (pembelian tier pakai
-- saldo). MySQL menyimpan enum inline di definisi kolom, jadi menambah value
-- baru berarti MODIFY COLUMN dengan daftar lengkap (lama + baru) - bukan ALTER
-- TYPE seperti Postgres.
ALTER TABLE `WalletLedger` MODIFY COLUMN `type` ENUM('DEPOSIT', 'ORDER_PAYMENT', 'REFUND', 'ADJUSTMENT', 'MEMBERSHIP') NOT NULL;

-- Bagian B: bonus saldo dari benefit tier "deposit_bonus", disnapshot saat
-- deposit dibuat. DEFAULT 0 supaya deposit yang sudah ada tidak terpengaruh.
ALTER TABLE `Deposit` ADD COLUMN `bonusAmount` BIGINT NOT NULL DEFAULT 0;

-- Bagian C: paket tier + kepemilikan tier per user.
CREATE TABLE `MembershipTier` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `price` BIGINT NOT NULL,
    `durationDays` INTEGER NOT NULL,
    `discountPercent` INTEGER NOT NULL DEFAULT 0,
    `depositBonusPercent` INTEGER NOT NULL DEFAULT 0,
    `benefits` JSON NOT NULL,
    `badgeColor` VARCHAR(191) NOT NULL DEFAULT '#a3a3a3',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MembershipTier_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `UserMembership` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tierId` VARCHAR(191) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `pricePaid` BIGINT NOT NULL,
    `durationDaysSnapshot` INTEGER NOT NULL,
    `source` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UserMembership_userId_expiresAt_idx`(`userId`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `UserMembership` ADD CONSTRAINT `UserMembership_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `UserMembership` ADD CONSTRAINT `UserMembership_tierId_fkey` FOREIGN KEY (`tierId`) REFERENCES `MembershipTier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Bagian D: seed 4 paket default (bronze/silver/gold/platinum). INSERT IGNORE
-- (create-only, pola sama migration seed sebelumnya) - kalau slug sudah ada
-- (mis. environment yang sudah pernah menjalankan seed.ts), baris yang sudah
-- diatur admin TIDAK ditimpa. Harga & benefit di sini cuma titik awal yang
-- masuk akal - admin bebas mengubah semuanya lewat panel.
INSERT IGNORE INTO `MembershipTier`
  (`id`, `name`, `slug`, `price`, `durationDays`, `discountPercent`, `depositBonusPercent`, `benefits`, `badgeColor`, `isActive`, `sortOrder`, `createdAt`, `updatedAt`)
VALUES
  (UUID(), 'Bronze', 'bronze', 15000, 30, 200, 0, JSON_ARRAY('free_order_fee'), '#b08d57', true, 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'Silver', 'silver', 35000, 30, 400, 100, JSON_ARRAY('free_order_fee', 'no_unique_code_order', 'deposit_bonus'), '#9ca3af', true, 2, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'Gold', 'gold', 75000, 30, 700, 200, JSON_ARRAY('free_order_fee', 'free_deposit_fee', 'no_unique_code_order', 'no_unique_code_deposit', 'deposit_bonus'), '#eab308', true, 3, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'Platinum', 'platinum', 150000, 30, 1200, 300, JSON_ARRAY('free_order_fee', 'free_deposit_fee', 'no_unique_code_order', 'no_unique_code_deposit', 'deposit_bonus', 'priority_badge'), '#38bdf8', true, 4, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
