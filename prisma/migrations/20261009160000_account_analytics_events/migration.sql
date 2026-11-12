CREATE TABLE `AccountAnalyticsEvent` (
  `id` VARCHAR(191) NOT NULL,
  `ownerId` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `AccountAnalyticsEvent_ownerId_kind_createdAt_idx` (`ownerId`,`kind`,`createdAt`),
  CONSTRAINT `AccountAnalyticsEvent_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TRIGGER `analytics_follow_created` AFTER INSERT ON `Follow`
FOR EACH ROW INSERT INTO `AccountAnalyticsEvent` (`id`,`ownerId`,`kind`) VALUES (UUID(),NEW.followedId,'FOLLOW');
CREATE TRIGGER `analytics_follow_deleted` AFTER DELETE ON `Follow`
FOR EACH ROW INSERT INTO `AccountAnalyticsEvent` (`id`,`ownerId`,`kind`) VALUES (UUID(),OLD.followedId,'UNFOLLOW');
