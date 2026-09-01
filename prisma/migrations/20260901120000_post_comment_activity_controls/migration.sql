ALTER TABLE `users`
ADD COLUMN `showLastActivity` BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE `UserMedia`
ADD COLUMN `shareCount` INTEGER NOT NULL DEFAULT 0,
ADD COLUMN `saveCount` INTEGER NOT NULL DEFAULT 0;

UPDATE `UserMedia` media
JOIN (
  SELECT `mediaId`, COUNT(*) AS saved_count
  FROM `SavedVideo`
  GROUP BY `mediaId`
) saved ON media.`id` = saved.`mediaId`
SET media.`saveCount` = saved.saved_count;

ALTER TABLE `VideoComment`
ADD COLUMN `isPinned` BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX `VideoComment_mediaId_isPinned_createdAt_idx`
ON `VideoComment`(`mediaId`, `isPinned`, `createdAt`);
