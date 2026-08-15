-- Margin otomatis per kategori + jejak perubahan harga.
--
-- SEMUA kolom baru punya DEFAULT dan mode bawaannya OFF, jadi migrasi ini NOL
-- perubahan perilaku saat deploy: tidak ada satu pun harga yang bergerak sampai
-- admin sengaja menyalakannya per kategori. Pola yang sama dipakai saat
-- Product.partnerVisible ditambahkan.
ALTER TABLE `Category`
  ADD COLUMN `autoMarginMode` ENUM('OFF', 'FOLLOW_DELTA', 'FORMULA') NOT NULL DEFAULT 'OFF',
  ADD COLUMN `autoMarginBp` INTEGER NOT NULL DEFAULT 800,
  ADD COLUMN `autoMarginRound` INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN `autoMarginMaxJumpBp` INTEGER NOT NULL DEFAULT 5000;

-- Jejak tiap perubahan harga yang tidak diketik manusia.
--
-- `productItemId` SENGAJA tanpa FOREIGN KEY, pola yang sama dengan
-- Order.productItemId: riwayat harga harus tetap terbaca setelah produknya
-- dihapus, dan FK akan membuat penghapusan produk gagal karena jejaknya sendiri.
-- Nama produk & item ikut disnapshot supaya tiap baris tetap bermakna sendiri.
CREATE TABLE `PriceChangeLog` (
  `id` VARCHAR(191) NOT NULL,
  `productItemId` VARCHAR(191) NOT NULL,
  `productName` VARCHAR(191) NOT NULL,
  `itemName` VARCHAR(191) NOT NULL,
  `oldSelling` BIGINT NOT NULL,
  `newSelling` BIGINT NOT NULL,
  `oldCost` BIGINT NOT NULL,
  `newCost` BIGINT NOT NULL,
  `source` VARCHAR(191) NOT NULL,
  `note` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `PriceChangeLog_createdAt_idx`(`createdAt`),
  INDEX `PriceChangeLog_productItemId_idx`(`productItemId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
