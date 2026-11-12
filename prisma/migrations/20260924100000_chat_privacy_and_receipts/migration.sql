-- ChatMessage delivery and pin columns were applied successfully during the
-- first deployment attempt; this migration resumes with the remaining DDL.

ALTER TABLE `ChatThread`
  MODIFY `kind` ENUM('DIRECT', 'BROADCAST', 'SELF') NOT NULL DEFAULT 'DIRECT',
  ADD COLUMN `selfOwnerId` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `ChatThread_selfOwnerId_key` (`selfOwnerId`),
  ADD CONSTRAINT `ChatThread_selfOwnerId_fkey` FOREIGN KEY (`selfOwnerId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `UserNotification`
  ADD COLUMN `hiddenAt` DATETIME(3) NULL,
  ADD INDEX `UserNotification_userId_hiddenAt_createdAt_idx` (`userId`, `hiddenAt`, `createdAt`);

ALTER TABLE `EarningLot`
  ADD COLUMN `hiddenAt` DATETIME(3) NULL,
  ADD INDEX `EarningLot_userId_hiddenAt_createdAt_idx` (`userId`, `hiddenAt`, `createdAt`);

CREATE TABLE `ChatPrivateCodeGroup` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `purpose` ENUM('HIDDEN_CHATS', 'SECURE_FOLDER') NOT NULL,
  `codeHash` CHAR(64) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `ChatPrivateCodeGroup_userId_purpose_codeHash_key` (`userId`, `purpose`, `codeHash`),
  INDEX `ChatPrivateCodeGroup_userId_purpose_idx` (`userId`, `purpose`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ChatPrivateCodeGroup_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `UserHiddenChat` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `threadId` VARCHAR(191) NOT NULL,
  `codeGroupId` VARCHAR(191) NOT NULL,
  `hideForAll` BOOLEAN NOT NULL DEFAULT false,
  `hiddenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `UserHiddenChat_userId_threadId_key` (`userId`, `threadId`),
  INDEX `UserHiddenChat_userId_codeGroupId_idx` (`userId`, `codeGroupId`),
  INDEX `UserHiddenChat_threadId_idx` (`threadId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `UserHiddenChat_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `UserHiddenChat_threadId_fkey` FOREIGN KEY (`threadId`) REFERENCES `ChatThread` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `UserHiddenChat_codeGroupId_fkey` FOREIGN KEY (`codeGroupId`) REFERENCES `ChatPrivateCodeGroup` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ChatHideRequest` (
  `id` VARCHAR(191) NOT NULL,
  `threadId` VARCHAR(191) NOT NULL,
  `requesterId` VARCHAR(191) NOT NULL,
  `recipientId` VARCHAR(191) NOT NULL,
  `action` ENUM('HIDE_FOR_ALL', 'UNHIDE_FOR_ALL') NOT NULL,
  `status` ENUM('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
  `expiresAt` DATETIME(3) NULL,
  `respondedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `ChatHideRequest_recipientId_status_createdAt_idx` (`recipientId`, `status`, `createdAt`),
  INDEX `ChatHideRequest_requesterId_threadId_createdAt_idx` (`requesterId`, `threadId`, `createdAt`),
  INDEX `ChatHideRequest_expiresAt_status_idx` (`expiresAt`, `status`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ChatHideRequest_threadId_fkey` FOREIGN KEY (`threadId`) REFERENCES `ChatThread` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ChatHideRequest_requesterId_fkey` FOREIGN KEY (`requesterId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ChatHideRequest_recipientId_fkey` FOREIGN KEY (`recipientId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SecureFolderMessage` (
  `id` VARCHAR(191) NOT NULL,
  `ownerId` VARCHAR(191) NOT NULL,
  `messageId` VARCHAR(191) NOT NULL,
  `codeGroupId` VARCHAR(191) NOT NULL,
  `movedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `SecureFolderMessage_ownerId_messageId_key` (`ownerId`, `messageId`),
  INDEX `SecureFolderMessage_ownerId_codeGroupId_movedAt_idx` (`ownerId`, `codeGroupId`, `movedAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `SecureFolderMessage_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `SecureFolderMessage_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `ChatMessage` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `SecureFolderMessage_codeGroupId_fkey` FOREIGN KEY (`codeGroupId`) REFERENCES `ChatPrivateCodeGroup` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ChatMute` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `threadId` VARCHAR(191) NOT NULL,
  `mutedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `ChatMute_userId_threadId_key` (`userId`, `threadId`),
  INDEX `ChatMute_threadId_idx` (`threadId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ChatMute_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ChatMute_threadId_fkey` FOREIGN KEY (`threadId`) REFERENCES `ChatThread` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
