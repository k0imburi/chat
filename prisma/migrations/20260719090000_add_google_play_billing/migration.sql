-- AlterTable
ALTER TABLE `CreditPurchase`
  ADD COLUMN `googlePlayPurchaseToken` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `CreditPurchase_googlePlayPurchaseToken_key` ON `CreditPurchase`(`googlePlayPurchaseToken`);

-- AlterTable
ALTER TABLE `AppSettings`
  ADD COLUMN `googlePlayEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `googlePlayPackageName` VARCHAR(191) NOT NULL DEFAULT 'com.chatandtip.app',
  ADD COLUMN `googlePlayServiceAccountJson` TEXT NULL;
