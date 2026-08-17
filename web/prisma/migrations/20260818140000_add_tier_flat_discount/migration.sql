-- Potongan FLAT paket reseller, khusus produk MANUAL.
--
-- Satu kolom dengan DEFAULT 0, jadi nol perubahan perilaku saat deploy: selama
-- admin belum mengisinya, produk manual tetap memakai discountPercent seperti
-- sekarang.
--
-- Di produk manual angka ini MENGGANTIKAN persentase, bukan ditambahkan di
-- atasnya - lihat lib/pricing/effective-price.ts. Tetap dijepit
-- ProductItem.memberPrice seperti diskon lain, jadi potongan flat sebesar apa
-- pun tidak bisa menembus batas bawah harga.
--
-- Diverifikasi identik dengan keluaran:
--   prisma migrate diff --from-schema-datamodel <skema sebelum> --to-schema-datamodel prisma/schema.prisma --script

-- AlterTable
ALTER TABLE `MembershipTier` ADD COLUMN `discountFlatManual` BIGINT NOT NULL DEFAULT 0;
