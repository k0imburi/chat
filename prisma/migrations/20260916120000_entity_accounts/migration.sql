ALTER TABLE `users`
  ADD COLUMN `accountType` ENUM('INDIVIDUAL', 'ENTITY') NOT NULL DEFAULT 'INDIVIDUAL',
  ADD COLUMN `physicalAddress` VARCHAR(191) NULL,
  ADD COLUMN `officialPhoneNumber` VARCHAR(191) NULL,
  ADD COLUMN `officialEmail` VARCHAR(191) NULL,
  ADD COLUMN `websiteUrl` VARCHAR(191) NULL,
  ADD COLUMN `entityDocuments` JSON NULL,
  ADD COLUMN `entityVerification` ENUM('NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'NOT_SUBMITTED',
  ADD COLUMN `entityBadgeColor` VARCHAR(191) NULL,
  ADD COLUMN `entityPublishedAt` DATETIME(3) NULL,
  ADD COLUMN `entityPlanType` ENUM('BUSINESS', 'PREMIUM') NULL,
  ADD COLUMN `entityPlanInterval` ENUM('MONTHLY', 'YEARLY') NULL,
  ADD COLUMN `entityPlanStartedAt` DATETIME(3) NULL,
  ADD COLUMN `entityPlanExpiresAt` DATETIME(3) NULL,
  ADD COLUMN `entityCallDurationMinutes` INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN `entityCallBufferMinutes` INTEGER NOT NULL DEFAULT 5;

CREATE INDEX `users_accountType_entityVerification_entityPublishedAt_idx`
  ON `users`(`accountType`, `entityVerification`, `entityPublishedAt`);
