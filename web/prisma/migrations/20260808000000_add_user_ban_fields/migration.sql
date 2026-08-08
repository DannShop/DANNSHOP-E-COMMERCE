-- Suspend/banned akun user.
--
-- Keduanya NULL-able tanpa DEFAULT, jadi migration ini NOL perubahan perilaku
-- saat deploy: seluruh user yang sudah ada otomatis `bannedAt = NULL` yang
-- artinya aktif normal. Tidak ada backfill yang perlu dijalankan.
--
-- bannedAt sengaja DATETIME, bukan BOOLEAN - menyimpan "kapan" sekaligus
-- "apakah", pola yang sama dengan User.emailVerifiedAt dan
-- PasswordResetToken.usedAt yang sudah ada di skema ini.
--
-- Tidak ada FK ke admin pelaku: AdminActionLog sudah mencatat siapa yang
-- melakukan aksi (preseden yang sama dipakai UserMembership untuk grant manual).
ALTER TABLE `User` ADD COLUMN `bannedAt` DATETIME(3) NULL;
ALTER TABLE `User` ADD COLUMN `banReason` TEXT NULL;
