-- Pencatatan modal untuk laporan laba.
--
-- DUA kolom nullable, nol perubahan perilaku saat deploy:
--   * ProductItem.costPrice - modal produk MANUAL, diisi admin. Produk AUTO
--     tidak memakainya (modalnya di ProviderSku.costPrice, diisi sync harga).
--   * Order.costPrice - SNAPSHOT modal per order, satu-satunya kolom yang
--     dibaca laporan laba. MANUAL: diisi saat checkout. AUTO: diisi saat
--     percobaan fulfillment BERHASIL (modal provider yang benar-benar
--     memproses, bukan yang dicoba pertama).
--
-- Order lama tetap NULL = "modal belum tercatat" - laporan menghitungnya
-- terpisah, tidak pernah menganggapnya nol.
--
-- Diverifikasi identik dengan keluaran:
--   prisma migrate diff --from-schema-datamodel <skema sebelum> --to-schema-datamodel prisma/schema.prisma --script

-- AlterTable
ALTER TABLE `ProductItem` ADD COLUMN `costPrice` BIGINT NULL;

-- AlterTable
ALTER TABLE `Order` ADD COLUMN `costPrice` BIGINT NULL;
