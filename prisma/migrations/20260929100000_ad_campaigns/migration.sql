CREATE TABLE `AdCampaign` (
  `id` VARCHAR(191) NOT NULL,
  `ownerId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `metric` ENUM('CPC', 'CPM', 'CPE') NOT NULL,
  `rate` DECIMAL(12, 4) NOT NULL,
  `status` ENUM('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED') NOT NULL DEFAULT 'DRAFT',
  `impressions` INTEGER NOT NULL DEFAULT 0,
  `clicks` INTEGER NOT NULL DEFAULT 0,
  `likes` INTEGER NOT NULL DEFAULT 0,
  `comments` INTEGER NOT NULL DEFAULT 0,
  `shares` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `AdCampaign_ownerId_status_createdAt_idx` (`ownerId`, `status`, `createdAt`),
  CONSTRAINT `AdCampaign_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
