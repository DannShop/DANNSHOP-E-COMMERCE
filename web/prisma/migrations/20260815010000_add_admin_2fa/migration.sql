-- Autentikasi dua faktor (TOTP).
--
-- Kedua kolom NULLABLE tanpa default, jadi seluruh akun yang sudah ada tetap
-- masuk seperti biasa setelah migrasi ini - 2FA baru berlaku untuk akun yang
-- mendaftarkannya sendiri. Tidak ada satu pun orang yang terkunci di luar oleh
-- deploy ini.
--
-- `totpSecretEnc` menyimpan rahasia TERENKRIPSI (lib/crypto.ts), bukan hash:
-- verifikasi TOTP butuh rahasia aslinya untuk menghitung ulang kode tiap 30
-- detik. Kalau bisa di-hash, sudah pasti di-hash.
--
-- `totpEnabledAt` yang menentukan aktif/tidak, BUKAN ada/tidaknya rahasia:
-- rahasia sudah ditulis begitu QR ditampilkan, tapi 2FA belum boleh berlaku
-- sampai orangnya membuktikan aplikasinya terpasang dengan memasukkan satu kode
-- yang valid. Tanpa pemisahan ini, menutup halaman di tengah pendaftaran
-- mengunci orang itu di luar akunnya sendiri.
ALTER TABLE `User`
  ADD COLUMN `totpSecretEnc` TEXT NULL,
  ADD COLUMN `totpEnabledAt` DATETIME(3) NULL;

-- Kode pemulihan — jalan masuk saat aplikasi autentikator hilang.
--
-- WAJIB ADA, bukan pelengkap: tanpa ini, HP admin yang hilang berarti panel
-- admin terkunci permanen untuk semua orang dan satu-satunya jalan keluar
-- adalah mengedit database langsung.
--
-- Yang disimpan HANYA hash SHA-256 (pola sama dengan PasswordResetToken), dan
-- ON DELETE CASCADE dipasang supaya menghapus user tidak meninggalkan kode
-- pemulihan yatim yang masih tervalidasi.
CREATE TABLE `TotpRecoveryCode` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `codeHash` VARCHAR(191) NOT NULL,
  `usedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `TotpRecoveryCode_codeHash_key`(`codeHash`),
  INDEX `TotpRecoveryCode_userId_idx`(`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TotpRecoveryCode`
  ADD CONSTRAINT `TotpRecoveryCode_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
