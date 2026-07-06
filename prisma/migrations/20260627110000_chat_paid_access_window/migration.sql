ALTER TABLE `ChatThread`
  ADD COLUMN `paidAccessOpenedAt` DATETIME(3) NULL,
  ADD COLUMN `paidAccessExpiresAt` DATETIME(3) NULL,
  ADD COLUMN `lastPaidCreditKind` ENUM('KEY', 'CHAT_CREDIT', 'VOICE_SESSION', 'VIDEO_SESSION') NULL;

ALTER TABLE `ChatMessage`
  ADD COLUMN `lockedPreviewText` VARCHAR(64) NULL,
  ADD COLUMN `paidByCreditKind` ENUM('KEY', 'CHAT_CREDIT', 'VOICE_SESSION', 'VIDEO_SESSION') NULL,
  ADD COLUMN `unlockedAt` DATETIME(3) NULL;

CREATE INDEX `ChatThread_paidAccessExpiresAt_idx` ON `ChatThread`(`paidAccessExpiresAt`);
