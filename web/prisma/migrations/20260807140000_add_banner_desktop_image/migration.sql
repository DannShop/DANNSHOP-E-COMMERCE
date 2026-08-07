-- Gambar banner versi desktop (32:9), terpisah dari versi mobile (21:9) yang
-- sudah ada di kolom `imageUrl`.
--
-- NULL-able tanpa default: banner yang sudah ada tetap valid apa adanya dan
-- carousel otomatis jatuh balik ke `imageUrl` untuk desktop (perilaku lama,
-- dipotong atas-bawah). Jadi migration ini nol perubahan tampilan saat
-- di-deploy - yang berubah cuma: admin SEKARANG BISA mengunggah versi desktop
-- terpisah kalau mau banner tampil utuh di dua-duanya.
ALTER TABLE `Banner` ADD COLUMN `imageUrlDesktop` VARCHAR(191) NULL;
