-- Peran karyawan (RBAC panel admin).
--
-- SELURUHNYA ADITIF, jadi deploy-nya nol perubahan perilaku:
--   * `Role` ditambahi nilai STAFF - tidak ada satu baris pun yang memakainya
--     sampai admin sengaja mengangkat seseorang jadi karyawan;
--   * `User.staffRoleId` nullable;
--   * `StaffRole` tabel baru murni.
--
-- ON DELETE SET NULL disengaja: menghapus sebuah peran TIDAK boleh ikut
-- menghapus akun karyawannya. Yang benar adalah karyawannya kehilangan seluruh
-- izin (jatuh ke nol), bukan hilang bersama perannya.
--
-- Diverifikasi identik dengan keluaran:
--   prisma migrate diff --from-schema-datamodel <skema sebelum> --to-schema-datamodel prisma/schema.prisma --script

-- AlterTable
ALTER TABLE `User` ADD COLUMN `staffRoleId` VARCHAR(191) NULL,
    MODIFY `role` ENUM('USER', 'ADMIN', 'STAFF') NOT NULL DEFAULT 'USER';

-- CreateTable
CREATE TABLE `StaffRole` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `permissions` JSON NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `StaffRole_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_staffRoleId_fkey` FOREIGN KEY (`staffRoleId`) REFERENCES `StaffRole`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
