-- AlterTable
ALTER TABLE `ProviderConfig` ADD COLUMN `minBalanceAlert` BIGINT NULL,
ADD COLUMN `balanceAlertStatus` ENUM('OK', 'LOW') NOT NULL DEFAULT 'OK';
