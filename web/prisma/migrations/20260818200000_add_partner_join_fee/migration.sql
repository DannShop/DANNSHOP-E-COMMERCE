-- Biaya join mitra H2H.
--
-- ADITIF TOTAL: hanya menambah kolom nullable ke tabel yang sudah ada. Tidak
-- ada kolom yang dihapus, tidak ada tipe yang berubah, tidak ada data yang
-- disentuh - pengajuan mitra yang sudah terlanjur ada tetap sah apa adanya
-- dengan seluruh kolom baru bernilai NULL (artinya: dari masa sebelum biaya
-- join ada).
--
-- Paket mitranya sendiri TIDAK ada di sini: ia disimpan sebagai satu baris
-- SiteSetting berisi JSON (key `partner_package`), jadi mengubah harga/diskon/
-- benefit paket tidak pernah menuntut migrasi.

ALTER TABLE `PartnerApplication`
  ADD COLUMN `joinPrice` BIGINT NULL,
  ADD COLUMN `joinFee` BIGINT NULL,
  ADD COLUMN `joinUniqueCode` INTEGER NULL,
  ADD COLUMN `joinTotal` BIGINT NULL,
  ADD COLUMN `joinPaymentMethod` VARCHAR(191) NULL,
  ADD COLUMN `joinRawResponse` JSON NULL,
  ADD COLUMN `joinExpiredAt` DATETIME(3) NULL,
  ADD COLUMN `joinPaidAt` DATETIME(3) NULL;
