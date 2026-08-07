-- Bagian A: expiry pembayaran per metode.
--
-- DEFAULT 15 dipilih supaya migration ini NOL perubahan perilaku saat deploy:
-- 15 menit persis sama dengan konstanta EXPIRY_MINUTES yang sebelumnya
-- hardcode di actions/checkout.ts dan actions/deposit.ts. Admin lalu bebas
-- mengubahnya per metode lewat panel tanpa deploy ulang.
ALTER TABLE `PaymentMethodConfig` ADD COLUMN `expiryMinutes` INTEGER NOT NULL DEFAULT 15;

-- Bagian B: dua metode e-wallet baru.
--
-- INSERT IGNORE (create-only), pola sama dengan migration
-- 20260805064622_seed_categories_and_payment_methods - kalau baris sudah ada
-- (mis. environment yang sempat menjalankan seed.ts), fee/label yang sudah
-- diatur admin TIDAK ditimpa.
--
-- isActive = false SENGAJA: ShopeePay/GoPay harus diaktifkan dulu di dashboard
-- Midtrans sebelum charge-nya diterima. Kalau row ini langsung aktif, metode
-- pembayaran akan muncul di checkout dan menghasilkan order FAILED untuk
-- customer sungguhan sebelum admin sempat memastikan channel-nya siap.
INSERT IGNORE INTO `PaymentMethodConfig`
  (`id`, `code`, `label`, `feeFlat`, `feePercent`, `expiryMinutes`, `isActive`, `sortOrder`, `createdAt`, `updatedAt`)
VALUES
  (UUID(), 'ewallet_gopay', 'GoPay', 0, 200, 15, false, 8, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'ewallet_shopeepay', 'ShopeePay', 0, 200, 15, false, 9, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
