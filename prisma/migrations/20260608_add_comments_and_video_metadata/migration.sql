-- AlterTable: add caption, description, commentCount to UserMedia
ALTER TABLE `UserMedia` ADD COLUMN `caption` TEXT NULL,
                        ADD COLUMN `description` TEXT NULL,
                        ADD COLUMN `commentCount` INTEGER NOT NULL DEFAULT 0;

-- CreateTable: VideoComment
CREATE TABLE `VideoComment` (
    `id` VARCHAR(191) NOT NULL,
    `mediaId` VARCHAR(191) NOT NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `text` TEXT NOT NULL,
    `parentId` VARCHAR(191) NULL,
    `likes` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `VideoComment_mediaId_createdAt_idx`(`mediaId`, `createdAt`),
    INDEX `VideoComment_parentId_idx`(`parentId`),
    INDEX `VideoComment_authorId_idx`(`authorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: CommentLike
CREATE TABLE `CommentLike` (
    `id` VARCHAR(191) NOT NULL,
    `commentId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `CommentLike_commentId_userId_key`(`commentId`, `userId`),
    INDEX `CommentLike_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey: VideoComment -> UserMedia
ALTER TABLE `VideoComment` ADD CONSTRAINT `VideoComment_mediaId_fkey`
    FOREIGN KEY (`mediaId`) REFERENCES `UserMedia`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: VideoComment -> users (author)
ALTER TABLE `VideoComment` ADD CONSTRAINT `VideoComment_authorId_fkey`
    FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: VideoComment -> VideoComment (self-referencing replies)
ALTER TABLE `VideoComment` ADD CONSTRAINT `VideoComment_parentId_fkey`
    FOREIGN KEY (`parentId`) REFERENCES `VideoComment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: CommentLike -> VideoComment
ALTER TABLE `CommentLike` ADD CONSTRAINT `CommentLike_commentId_fkey`
    FOREIGN KEY (`commentId`) REFERENCES `VideoComment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: CommentLike -> users
ALTER TABLE `CommentLike` ADD CONSTRAINT `CommentLike_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
