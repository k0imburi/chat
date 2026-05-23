-- CreateTable
CREATE TABLE `AdminUser` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `role` ENUM('SUPER_ADMIN', 'ADMIN', 'SUPPORT') NOT NULL DEFAULT 'SUPER_ADMIN',
    `avatarUrl` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AdminUser_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AppUser` (
    `id` VARCHAR(191) NOT NULL,
    `externalId` VARCHAR(191) NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `gender` VARCHAR(191) NOT NULL,
    `birthday` DATETIME(3) NULL,
    `email` VARCHAR(191) NULL,
    `phoneNumber` VARCHAR(191) NULL,
    `avatarUrl` VARCHAR(191) NULL,
    `deviceToken` VARCHAR(191) NULL,
    `deviceSystem` VARCHAR(191) NULL,
    `swipeCount` INTEGER NOT NULL DEFAULT 0,
    `verified` BOOLEAN NOT NULL DEFAULT false,
    `lastSwipeDate` DATETIME(3) NULL,
    `status` ENUM('ACTIVE', 'BLOCKED', 'REPORTED', 'HIDDEN') NOT NULL DEFAULT 'ACTIVE',
    `loginProvider` ENUM('EMAIL', 'PHONE', 'GOOGLE', 'APPLE') NOT NULL DEFAULT 'EMAIL',
    `country` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `interests` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `lastActiveAt` DATETIME(3) NULL,

    UNIQUE INDEX `AppUser_externalId_key`(`externalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserMedia` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `kind` ENUM('PROFILE_VIDEO', 'GALLERY_VIDEO', 'AVATAR_IMAGE', 'IMAGE', 'DOCUMENT') NOT NULL,
    `title` VARCHAR(191) NULL,
    `objectKey` VARCHAR(191) NULL,
    `url` VARCHAR(191) NOT NULL,
    `thumbnailUrl` VARCHAR(191) NULL,
    `mimeType` VARCHAR(191) NULL,
    `sizeBytes` INTEGER NULL,
    `views` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `UserMedia_userId_kind_idx`(`userId`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Report` (
    `id` VARCHAR(191) NOT NULL,
    `reportedUserId` VARCHAR(191) NOT NULL,
    `reportedById` VARCHAR(191) NULL,
    `message` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolvedAt` DATETIME(3) NULL,

    INDEX `Report_reportedUserId_idx`(`reportedUserId`),
    INDEX `Report_reportedById_idx`(`reportedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentPlan` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `interval` ENUM('ONE_TIME', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY') NOT NULL DEFAULT 'MONTHLY',
    `intervalCount` INTEGER NOT NULL DEFAULT 1,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `features` JSON NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PaymentPlan_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NotificationCampaign` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL,
    `message` TEXT NOT NULL,
    `channel` ENUM('IN_APP', 'EMAIL', 'SMS', 'WEBHOOK') NOT NULL DEFAULT 'IN_APP',
    `status` ENUM('DRAFT', 'SENT', 'FAILED') NOT NULL DEFAULT 'DRAFT',
    `sentAt` DATETIME(3) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserNotification` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `senderId` VARCHAR(191) NULL,
    `title` VARCHAR(191) NULL,
    `message` TEXT NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'alert',
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `UserNotification_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WalletTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `senderId` VARCHAR(191) NULL,
    `receiverId` VARCHAR(191) NULL,
    `senderName` VARCHAR(191) NULL,
    `receiverName` VARCHAR(191) NULL,
    `transactionId` VARCHAR(191) NOT NULL,
    `metadata` JSON NULL,
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `WalletTransaction_transactionId_key`(`transactionId`),
    INDEX `WalletTransaction_userId_date_idx`(`userId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WithdrawalRequest` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `method` VARCHAR(191) NOT NULL,
    `destination` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Asset` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `objectKey` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NULL,
    `contentType` VARCHAR(191) NULL,
    `sizeBytes` INTEGER NULL,
    `visibility` VARCHAR(191) NOT NULL DEFAULT 'public',
    `bucket` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Asset_objectKey_key`(`objectKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AppSettings` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `appName` VARCHAR(191) NOT NULL DEFAULT 'ChatAndTip',
    `maxVideosUpload` INTEGER NOT NULL DEFAULT 10,
    `contactEmail` VARCHAR(191) NULL,
    `contactPhone` VARCHAR(191) NULL,
    `address` VARCHAR(191) NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `minimumTip` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `transactionFeePercent` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `usdToKesRate` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `freeMemberSwipeLimit` INTEGER NOT NULL DEFAULT 20,
    `showDiscoverAdAfterSwipes` INTEGER NOT NULL DEFAULT 5,
    `allowVideoModeration` BOOLEAN NOT NULL DEFAULT false,
    `showAds` BOOLEAN NOT NULL DEFAULT false,
    `allowFreeAccess` BOOLEAN NOT NULL DEFAULT false,
    `allowVideoCall` BOOLEAN NOT NULL DEFAULT true,
    `allowVoiceCall` BOOLEAN NOT NULL DEFAULT true,
    `allowSendImages` BOOLEAN NOT NULL DEFAULT true,
    `adminEmail` VARCHAR(191) NULL,
    `jwtExpiry` VARCHAR(191) NOT NULL DEFAULT '7d',
    `mpesaConsumerKey` VARCHAR(191) NULL,
    `mpesaConsumerSecret` VARCHAR(191) NULL,
    `mpesaPasskey` VARCHAR(191) NULL,
    `mpesaShortcode` VARCHAR(191) NULL,
    `mpesaStoreNumber` VARCHAR(191) NULL,
    `mpesaShortcodeType` VARCHAR(191) NOT NULL DEFAULT 'CustomerPayBillOnline',
    `mpesaEnvironment` VARCHAR(191) NOT NULL DEFAULT 'sandbox',
    `paypalClientId` VARCHAR(191) NULL,
    `paypalClientSecret` VARCHAR(191) NULL,
    `r2AccountId` VARCHAR(191) NULL,
    `r2AccessKeyId` VARCHAR(191) NULL,
    `r2SecretAccessKey` VARCHAR(191) NULL,
    `r2BucketName` VARCHAR(191) NULL,
    `r2PublicBaseUrl` VARCHAR(191) NULL,
    `r2Region` VARCHAR(191) NOT NULL DEFAULT 'auto',
    `r2Endpoint` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserMedia` ADD CONSTRAINT `UserMedia_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `AppUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Report` ADD CONSTRAINT `Report_reportedUserId_fkey` FOREIGN KEY (`reportedUserId`) REFERENCES `AppUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Report` ADD CONSTRAINT `Report_reportedById_fkey` FOREIGN KEY (`reportedById`) REFERENCES `AppUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NotificationCampaign` ADD CONSTRAINT `NotificationCampaign_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `AdminUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserNotification` ADD CONSTRAINT `UserNotification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `AppUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WalletTransaction` ADD CONSTRAINT `WalletTransaction_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `AppUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WithdrawalRequest` ADD CONSTRAINT `WithdrawalRequest_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `AppUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
