-- Data seed (bukan cuma schema) supaya Bagian A (kategori baru) + Bagian B
-- (metode pembayaran) langsung punya data begitu migration ini di-deploy ke
-- lingkungan mana pun, termasuk production - sebelumnya cuma di-seed lewat
-- prisma/seed.ts yang dijalankan manual dan sempat kelewat di production.
--
-- Kategori: upsert by slug (rename kategori lama + tambah 5 baru), aman
-- diulang. Metode pembayaran: INSERT IGNORE (create-only) - kalau admin
-- sudah pernah ubah fee lewat panel, baris yang sudah ada TIDAK ditimpa.

INSERT INTO `Category` (`id`, `slug`, `name`, `sortOrder`) VALUES
  (UUID(), 'games', 'Top Up Game', 1),
  (UUID(), 'pulsa-data', 'Pulsa', 2),
  (UUID(), 'paket-internet', 'Paket Internet', 3),
  (UUID(), 'telepon-sms', 'Telepon & SMS', 4),
  (UUID(), 'masa-aktif', 'Masa Aktif', 5),
  (UUID(), 'pln', 'Token Listrik', 6),
  (UUID(), 'e-money', 'E-Money', 7),
  (UUID(), 'voucher', 'Voucher', 8),
  (UUID(), 'aktivasi-voucher', 'Aktivasi Voucher', 9),
  (UUID(), 'tagihan', 'Tagihan', 10)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `sortOrder` = VALUES(`sortOrder`);

INSERT IGNORE INTO `PaymentMethodConfig` (`id`, `code`, `label`, `feeFlat`, `feePercent`, `isActive`, `sortOrder`, `createdAt`, `updatedAt`) VALUES
  (UUID(), 'qris', 'QRIS', 0, 70, true, 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'va_bca', 'BCA Virtual Account', 4000, 0, true, 2, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'va_bni', 'BNI Virtual Account', 4000, 0, true, 3, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'va_bri', 'BRI Virtual Account', 4000, 0, true, 4, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'va_mandiri', 'Mandiri Bill Payment', 4000, 0, true, 5, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'va_permata', 'Permata Virtual Account', 4000, 0, true, 6, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'va_cimb', 'CIMB Niaga Virtual Account', 4000, 0, true, 7, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
