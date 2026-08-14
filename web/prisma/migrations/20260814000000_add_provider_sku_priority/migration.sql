-- Urutan pemilihan provider per item (angka kecil dicoba lebih dulu).
--
-- Sebelum ini, selectFulfillmentSku() meng-hardcode DIGIFLAZZ, jadi satu item
-- efektif cuma bisa dilayani satu provider. Kolom ini yang memungkinkan satu item
-- dipetakan ke beberapa provider sekaligus - syarat supaya failover antar-provider
-- punya tujuan yang jelas saat provider utama gagal.
--
-- Default 100 (bukan 0) supaya masih ada ruang di bawahnya untuk menaikkan
-- prioritas sebuah SKU tanpa harus menurunkan semua yang lain.
ALTER TABLE `ProviderSku` ADD COLUMN `priority` INTEGER NOT NULL DEFAULT 100;
