CREATE TABLE `AnalyticsView` (
  `id` VARCHAR(191) NOT NULL,
  `mediaId` VARCHAR(191) NOT NULL,
  `viewerKey` VARCHAR(191) NOT NULL,
  `country` VARCHAR(191) NULL,
  `watchMs` INTEGER NOT NULL DEFAULT 0,
  `durationMs` INTEGER NOT NULL DEFAULT 0,
  `completed` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `AnalyticsView_mediaId_createdAt_idx` (`mediaId`, `createdAt`),
  INDEX `AnalyticsView_createdAt_idx` (`createdAt`),
  CONSTRAINT `AnalyticsView_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `UserMedia` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AnalyticsReportSchedule` (
  `userId` VARCHAR(191) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT false,
  `frequency` INTEGER NOT NULL DEFAULT 7,
  `nextRunAt` DATETIME(3) NOT NULL,
  `leasedUntil` DATETIME(3) NULL,
  `lastSentAt` DATETIME(3) NULL,
  `lastError` VARCHAR(191) NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`userId`),
  INDEX `AnalyticsReportSchedule_enabled_nextRunAt_idx` (`enabled`, `nextRunAt`),
  CONSTRAINT `AnalyticsReportSchedule_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
