ALTER TABLE `CreditPurchase`
  ADD COLUMN `purchasedById` VARCHAR(191) NULL,
  ADD INDEX `CreditPurchase_purchasedById_createdAt_idx` (`purchasedById`, `createdAt`);
