CREATE TABLE `SavedVideo` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `mediaId` VARCHAR(191) NOT NULL,
    `savedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `SavedVideo_userId_mediaId_key`(`userId`, `mediaId`),
    INDEX `SavedVideo_userId_savedAt_idx`(`userId`, `savedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `SavedVideo` ADD CONSTRAINT `SavedVideo_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `SavedVideo` ADD CONSTRAINT `SavedVideo_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `UserMedia`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
