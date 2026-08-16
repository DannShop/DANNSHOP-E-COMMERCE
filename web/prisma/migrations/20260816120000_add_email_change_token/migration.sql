-- Token konfirmasi ganti email.
--
-- Tabel BARU, nol perubahan pada tabel yang sudah ada — deploy migrasi ini nol
-- perubahan perilaku sampai ada yang benar-benar memakai form ganti email.
--
-- Alamat tujuan dititipkan di `newEmail` dan baru dipindahkan ke `User.email`
-- setelah link di inbox BARU diklik. Alasannya ada di komentar model
-- EmailChangeToken pada schema.prisma: email adalah identitas login SEKALIGUS
-- alamat tujuan link reset password, jadi menulisnya langsung membuat satu
-- salah ketik mengunci orangnya di luar akun sendiri tanpa jalan pulang.
--
-- Yang disimpan HANYA hash SHA-256 dari token mentah (pola sama dengan
-- PasswordResetToken & TotpRecoveryCode) — token mentahnya cuma ada di link
-- email, jadi bocornya isi tabel ini tidak bisa dipakai mengambil alih akun.
--
-- ON DELETE CASCADE supaya menghapus user tidak meninggalkan token yatim yang
-- masih tervalidasi.
CREATE TABLE `EmailChangeToken` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `newEmail` VARCHAR(191) NOT NULL,
  `tokenHash` VARCHAR(191) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `usedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `EmailChangeToken_tokenHash_key`(`tokenHash`),
  INDEX `EmailChangeToken_userId_idx`(`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `EmailChangeToken`
  ADD CONSTRAINT `EmailChangeToken_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
