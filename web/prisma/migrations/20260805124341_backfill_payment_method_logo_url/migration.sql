-- Backfill logoUrl default untuk 7 PaymentMethodConfig yang sudah ada di
-- production. Baris-baris ini dibuat oleh migration
-- 20260805064622_seed_categories_and_payment_methods (INSERT IGNORE) yang
-- tidak pernah mengisi kolom logoUrl - jadi asset SVG yang sudah di-commit ke
-- repo (public/payment-logos/*.svg) belum pernah tersambung ke data
-- production, picker checkout/deposit & marquee tetap fallback ke ikon
-- generik. Idempotent (WHERE logoUrl IS NULL) dan tidak menimpa logo custom
-- yang sudah pernah diisi/upload admin lewat panel.
UPDATE `PaymentMethodConfig` SET `logoUrl` = '/payment-logos/qris.svg' WHERE `code` = 'qris' AND `logoUrl` IS NULL;
UPDATE `PaymentMethodConfig` SET `logoUrl` = '/payment-logos/bca.svg' WHERE `code` = 'va_bca' AND `logoUrl` IS NULL;
UPDATE `PaymentMethodConfig` SET `logoUrl` = '/payment-logos/bni.svg' WHERE `code` = 'va_bni' AND `logoUrl` IS NULL;
UPDATE `PaymentMethodConfig` SET `logoUrl` = '/payment-logos/bri.svg' WHERE `code` = 'va_bri' AND `logoUrl` IS NULL;
UPDATE `PaymentMethodConfig` SET `logoUrl` = '/payment-logos/mandiri.svg' WHERE `code` = 'va_mandiri' AND `logoUrl` IS NULL;
UPDATE `PaymentMethodConfig` SET `logoUrl` = '/payment-logos/permata.svg' WHERE `code` = 'va_permata' AND `logoUrl` IS NULL;
UPDATE `PaymentMethodConfig` SET `logoUrl` = '/payment-logos/cimb-niaga.svg' WHERE `code` = 'va_cimb' AND `logoUrl` IS NULL;
