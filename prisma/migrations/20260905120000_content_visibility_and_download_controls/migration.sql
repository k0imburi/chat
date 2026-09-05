ALTER TABLE `users`
  ADD COLUMN `allowPostDownloads` BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE `UserMedia`
  ADD COLUMN `isHiddenByOwner` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `VideoComment`
  ADD COLUMN `isHidden` BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX `VideoComment_mediaId_isHidden_isPinned_createdAt_idx`
  ON `VideoComment`(`mediaId`, `isHidden`, `isPinned`, `createdAt`);
