-- Tiga kolom baru pada ProductItem. SEMUANYA NULLABLE tanpa default, jadi
-- seluruh item yang sudah ada tidak berubah perilakunya sedikit pun setelah
-- migrasi ini dijalankan.
--
-- `description`   - penjelas singkat per nominal, tampil di halaman produk.
--                   Terpisah dari Product.description yang menjelaskan produknya
--                   secara utuh; yang perlu diberitahu pembeli sering melekat
--                   pada satu nominal saja ("bonus event", "maks 1x per akun").
--
-- `manualSkuCode` - kode buatan admin untuk produk MANUAL. Tidak dibaca mesin
--                   fulfillment mana pun; murni label supaya barang yang dikirim
--                   tangan tetap punya identitas yang bisa dirujuk.
--
-- `stock`         - stok AWAL. NULL = tak terbatas (bawaan). Sisanya TIDAK
--                   disimpan di kolom mana pun: diturunkan dari status order
--                   (lib/catalog/stock.ts). Alasannya sama persis dengan kuota
--                   voucher - status order pindah ke keadaan gagal di delapan
--                   tempat, dan counter yang lupa dikembalikan menyusut diam-diam
--                   tanpa menimbulkan error apa pun.
ALTER TABLE `ProductItem`
  ADD COLUMN `description` TEXT NULL,
  ADD COLUMN `manualSkuCode` VARCHAR(191) NULL,
  ADD COLUMN `stock` INTEGER NULL;
