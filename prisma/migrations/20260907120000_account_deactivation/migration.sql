ALTER TABLE `users`
  ADD COLUMN `deactivatedAt` DATETIME(3) NULL,
  ADD COLUMN `scheduledDeletionAt` DATETIME(3) NULL,
  ADD COLUMN `accountPurgedAt` DATETIME(3) NULL;

CREATE INDEX `users_scheduledDeletionAt_accountPurgedAt_idx`
  ON `users`(`scheduledDeletionAt`, `accountPurgedAt`);
