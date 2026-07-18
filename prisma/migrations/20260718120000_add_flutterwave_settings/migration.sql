-- AlterTable
ALTER TABLE `AppSettings`
  ADD COLUMN `flutterwaveEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `flutterwaveClientId` VARCHAR(191) NULL,
  ADD COLUMN `flutterwaveClientSecret` VARCHAR(191) NULL,
  ADD COLUMN `flutterwaveSecretHash` VARCHAR(191) NULL,
  ADD COLUMN `flutterwaveBaseUrl` VARCHAR(191) NOT NULL DEFAULT 'https://developersandbox-api.flutterwave.com',
  ADD COLUMN `flutterwaveCurrency` VARCHAR(191) NOT NULL DEFAULT 'KES';
