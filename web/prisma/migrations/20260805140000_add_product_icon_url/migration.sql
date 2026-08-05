-- AlterTable
ALTER TABLE `product` ADD COLUMN `iconUrl` VARCHAR(191) NULL;

-- Produk lama hanya punya satu gambar di `banner`, yang selama ini dipakai
-- sekaligus sebagai ikon persegi. Salin ke `iconUrl` supaya tampilan katalog &
-- trending tidak mendadak kosong sebelum admin sempat mengunggah ikon baru.
UPDATE `product` SET `iconUrl` = `banner` WHERE `banner` IS NOT NULL AND `iconUrl` IS NULL;
