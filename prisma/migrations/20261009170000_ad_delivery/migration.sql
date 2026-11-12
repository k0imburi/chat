-- AlterTable
ALTER TABLE `AdCampaign` ADD COLUMN `budgetMicros` BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN `creative` JSON NULL,
    ADD COLUMN `fundedMicros` BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN `sourceMediaId` VARCHAR(191) NULL,
    ADD COLUMN `spentMicros` BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `UserMedia` ADD COLUMN `adCampaignId` VARCHAR(191) NULL,
    ADD COLUMN `adCta` VARCHAR(191) NULL,
    ADD COLUMN `adWebsite` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `AdFeedDay` (
    `id` VARCHAR(191) NOT NULL,
    `lastAdId` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FeedExposure` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `mediaId` VARCHAR(191) NOT NULL,
    `day` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FeedExposure_userId_day_mediaId_idx`(`userId`, `day`, `mediaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdFunding` (
    `id` VARCHAR(191) NOT NULL,
    `campaignId` VARCHAR(191) NOT NULL,
    `requestKey` VARCHAR(191) NOT NULL,
    `amountCents` INTEGER NOT NULL,
    `provider` VARCHAR(191) NOT NULL DEFAULT 'STRIPE',
    `amountLocalCents` INTEGER NULL,
    `stripeSessionId` VARCHAR(191) NULL,
    `checkoutUrl` TEXT NULL,
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AdFunding_stripeSessionId_key`(`stripeSessionId`),
    UNIQUE INDEX `AdFunding_campaignId_requestKey_key`(`campaignId`, `requestKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdDelivery` (
    `id` VARCHAR(191) NOT NULL,
    `campaignId` VARCHAR(191) NOT NULL,
    `viewerId` VARCHAR(191) NOT NULL,
    `country` VARCHAR(191) NOT NULL,
    `day` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AdDelivery_viewerId_day_campaignId_idx`(`viewerId`, `day`, `campaignId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdEvent` (
    `id` VARCHAR(191) NOT NULL,
    `deliveryId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `chargeMicros` BIGINT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AdEvent_deliveryId_kind_key`(`deliveryId`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `UserMedia_adCampaignId_key` ON `UserMedia`(`adCampaignId`);

-- AddForeignKey
ALTER TABLE `AdFunding` ADD CONSTRAINT `AdFunding_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `AdCampaign`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AdDelivery` ADD CONSTRAINT `AdDelivery_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `AdCampaign`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AdEvent` ADD CONSTRAINT `AdEvent_deliveryId_fkey` FOREIGN KEY (`deliveryId`) REFERENCES `AdDelivery`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserMedia` ADD CONSTRAINT `UserMedia_adCampaignId_fkey` FOREIGN KEY (`adCampaignId`) REFERENCES `AdCampaign`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
