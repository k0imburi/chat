-- Add repost/reshare support for mobile media feeds.
ALTER TABLE `UserMedia` ADD COLUMN `repostCount` INTEGER NOT NULL DEFAULT 0;

CREATE TABLE `MediaRepost` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `mediaId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `MediaRepost_userId_mediaId_key`(`userId`, `mediaId`),
    INDEX `MediaRepost_mediaId_createdAt_idx`(`mediaId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `MediaRepost` ADD CONSTRAINT `MediaRepost_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `MediaRepost` ADD CONSTRAINT `MediaRepost_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `UserMedia`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
