-- Satu migrasi untuk tiga fitur sekaligus (analytics pengunjung, produk
-- fulfillment manual, cek ID game) supaya cukup sekali `prisma migrate deploy`
-- ke produksi, bukan tiga jendela waktu terpisah yang masing-masing bisa
-- terlewat.
--
-- SELURUH perubahan di bawah bersifat ADITIF dan punya DEFAULT: tidak ada kolom
-- yang dihapus, tidak ada yang berubah tipe, dan tidak ada backfill yang perlu
-- dijalankan. Deployment kode LAMA tetap berjalan normal setelah migrasi ini
-- naik (dia cuma tidak tahu kolom barunya ada), jadi urutan deploy-vs-migrasi
-- tidak menciptakan jendela rusak.

-- ===== 1. Mode pemenuhan pesanan (produk manual / App Premium) =====
--
-- Sengaja BUKAN nilai baru pada enum OrderStatus: order manual melewati
-- rangkaian status yang sama persis (PAID -> PROCESSING -> COMPLETED), yang
-- berbeda hanya siapa yang menuntaskannya. Lihat komentar enum FulfillmentMode
-- di schema.prisma.
--
-- Kolom pada Order adalah SNAPSHOT, bukan bacaan ulang dari produk: kalau admin
-- mengubah sebuah produk dari MANUAL ke AUTO, order lama yang belum tuntas
-- tidak boleh mendadak dicoba dikirim ke provider yang tidak punya SKU-nya.
ALTER TABLE `Product` ADD COLUMN `fulfillmentMode` ENUM('AUTO', 'MANUAL') NOT NULL DEFAULT 'AUTO';
ALTER TABLE `Order` ADD COLUMN `fulfillmentMode` ENUM('AUTO', 'MANUAL') NOT NULL DEFAULT 'AUTO';

-- ===== 2. Cek ID / nickname game =====
--
-- `nicknameCheckKey` sudah ada sejak migrasi awal tapi tidak pernah dibaca kode
-- mana pun; sekarang dipakai sebagai kode game untuk placeholder {game}.
-- Kolom baru di sini hanya saklar per-produknya. Dua kontrol terpisah dengan
-- sengaja: admin bisa mengisi & mengetes kode gamenya lebih dulu, baru
-- menyalakannya untuk pembeli.
ALTER TABLE `Product` ADD COLUMN `idCheckEnabled` BOOLEAN NOT NULL DEFAULT false;

-- ===== 3. Analytics pengunjung =====
--
-- PageView TIDAK menyimpan alamat IP. `visitorHash` = SHA-256 dari
-- (IP + user agent + garam harian rahasia) - cukup untuk menghitung pengunjung
-- unik dalam satu hari, tidak bisa dibalik jadi identitas, dan berganti tiap
-- hari sehingga tidak bisa dipakai melacak orang antar-hari.
--
-- Tabel ini SEMENTARA: job cron "rollup-analytics" meringkasnya ke
-- AnalyticsDaily lalu membuang baris yang lebih tua dari 30 hari. Tanpa itu,
-- tabel ini akan jadi yang terbesar di database dalam hitungan bulan.
CREATE TABLE `PageView` (
    `id` VARCHAR(191) NOT NULL,
    `path` VARCHAR(255) NOT NULL,
    `visitorHash` VARCHAR(64) NOT NULL,
    `sessionId` VARCHAR(64) NOT NULL,
    `referrerHost` VARCHAR(191) NULL,
    `device` VARCHAR(16) NOT NULL,
    `userId` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PageView_createdAt_idx`(`createdAt`),
    INDEX `PageView_sessionId_idx`(`sessionId`),
    INDEX `PageView_path_createdAt_idx`(`path`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Ringkasan harian PERMANEN, dibuat sebelum baris mentahnya dibuang, supaya
-- grafik jangka panjang tetap ada tanpa menyimpan data mentah selamanya.
-- Rincian disimpan sebagai JSON, bukan tabel anak: isinya selalu dibaca utuh
-- per tanggal dan tidak pernah di-query per baris.
CREATE TABLE `AnalyticsDaily` (
    `date` DATE NOT NULL,
    `pageviews` INTEGER NOT NULL DEFAULT 0,
    `visitors` INTEGER NOT NULL DEFAULT 0,
    `sessions` INTEGER NOT NULL DEFAULT 0,
    `topPaths` JSON NOT NULL,
    `topReferrers` JSON NOT NULL,
    `devices` JSON NOT NULL,
    `computedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`date`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
