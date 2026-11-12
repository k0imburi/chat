ALTER TABLE `users` ADD COLUMN `entityDocumentReview` JSON NULL;

CREATE TABLE `AccountVerification` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `status` ENUM('NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'NOT_SUBMITTED',
  `idFrontObjectKey` VARCHAR(191) NULL,
  `idBackObjectKey` VARCHAR(191) NULL,
  `selfieObjectKey` VARCHAR(191) NULL,
  `rejectionReason` TEXT NULL,
  `submittedAt` DATETIME(3) NULL,
  `reviewedAt` DATETIME(3) NULL,
  `reviewerId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `AccountVerification_userId_key`(`userId`),
  INDEX `AccountVerification_status_submittedAt_idx`(`status`, `submittedAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `AccountVerification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
