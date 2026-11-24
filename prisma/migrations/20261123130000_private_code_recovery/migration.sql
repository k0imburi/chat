CREATE TABLE `PrivateCodeRecovery` (
  `userId` VARCHAR(191) NOT NULL,
  `encryptedToken` TEXT NOT NULL,
  `issuedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`userId`),
  CONSTRAINT `PrivateCodeRecovery_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `ChatPrivateCodeGroup` ADD COLUMN `encryptedRecoveryPin` TEXT NULL;
