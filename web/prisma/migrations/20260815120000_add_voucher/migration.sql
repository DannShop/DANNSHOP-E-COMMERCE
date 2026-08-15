-- Kode promo / voucher.
--
-- NOL perubahan perilaku saat deploy: seluruh kolom baru pada `Order` punya
-- DEFAULT, dan tidak ada satu pun voucher yang tercipta oleh migrasi ini. Order
-- yang sudah ada tetap `discount = 0` dan `voucherCode = NULL`, yang persis
-- artinya "tidak memakai voucher".
ALTER TABLE `Order`
  ADD COLUMN `discount` BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN `voucherCode` VARCHAR(191) NULL;

CREATE TABLE `Voucher` (
  `id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `discountType` ENUM('PERCENT', 'FIXED') NOT NULL,
  `percentBp` INTEGER NOT NULL DEFAULT 0,
  `amount` BIGINT NOT NULL DEFAULT 0,
  `minSpend` BIGINT NOT NULL DEFAULT 0,
  `quota` INTEGER NOT NULL DEFAULT 0,
  `perTargetLimit` INTEGER NOT NULL DEFAULT 1,
  `startAt` DATETIME(3) NULL,
  `endAt` DATETIME(3) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `allowFlashSale` BOOLEAN NOT NULL DEFAULT false,
  `allowGuest` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `Voucher_code_key`(`code`),
  INDEX `Voucher_isActive_endAt_idx`(`isActive`, `endAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Satu baris per pemakaian voucher.
--
-- SENGAJA TIDAK ADA kolom penghitung yang harus dikurangi lagi saat order gagal.
-- Pemakaian yang masih sah diturunkan dari status ordernya lewat JOIN (lihat
-- lib/voucher/usage.ts), karena status order berpindah ke keadaan gagal di enam
-- tempat berbeda dan penghitung manual menuntut keenamnya ingat melepas kuota.
CREATE TABLE `VoucherRedemption` (
  `id` VARCHAR(191) NOT NULL,
  `voucherId` VARCHAR(191) NOT NULL,
  `orderId` VARCHAR(191) NOT NULL,
  `targetKey` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NULL,
  `amount` BIGINT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `VoucherRedemption_orderId_key`(`orderId`),
  INDEX `VoucherRedemption_voucherId_targetKey_idx`(`voucherId`, `targetKey`),
  INDEX `VoucherRedemption_voucherId_createdAt_idx`(`voucherId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Pembatas cakupan voucher. Tabel relasi many-to-many implisit Prisma:
-- namanya diawali `_` dan kolomnya WAJIB bernama A/B urut abjad nama model.
CREATE TABLE `_VoucherCategories` (
  `A` VARCHAR(191) NOT NULL,
  `B` VARCHAR(191) NOT NULL,

  UNIQUE INDEX `_VoucherCategories_AB_unique`(`A`, `B`),
  INDEX `_VoucherCategories_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `_VoucherProducts` (
  `A` VARCHAR(191) NOT NULL,
  `B` VARCHAR(191) NOT NULL,

  UNIQUE INDEX `_VoucherProducts_AB_unique`(`A`, `B`),
  INDEX `_VoucherProducts_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `VoucherRedemption`
  ADD CONSTRAINT `VoucherRedemption_voucherId_fkey`
  FOREIGN KEY (`voucherId`) REFERENCES `Voucher`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `VoucherRedemption`
  ADD CONSTRAINT `VoucherRedemption_orderId_fkey`
  FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `_VoucherCategories`
  ADD CONSTRAINT `_VoucherCategories_A_fkey`
  FOREIGN KEY (`A`) REFERENCES `Category`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `_VoucherCategories`
  ADD CONSTRAINT `_VoucherCategories_B_fkey`
  FOREIGN KEY (`B`) REFERENCES `Voucher`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `_VoucherProducts`
  ADD CONSTRAINT `_VoucherProducts_A_fkey`
  FOREIGN KEY (`A`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `_VoucherProducts`
  ADD CONSTRAINT `_VoucherProducts_B_fkey`
  FOREIGN KEY (`B`) REFERENCES `Voucher`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
