-- AlterTable
ALTER TABLE `AppSettings`
  ADD COLUMN `mpesaEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `paystackCardEnabled` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `paystackMpesaEnabled` BOOLEAN NOT NULL DEFAULT true;
