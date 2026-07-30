-- Add VIDEO to ChatMessageType and video fields to ChatMessage, so chat
-- messages can carry a video (public URL, or a private object key for
-- paid/locked replies, matching the existing image pattern) plus a
-- thumbnail for the message bubble.

ALTER TABLE `ChatMessage`
  MODIFY COLUMN `type` ENUM('TEXT', 'IMAGE', 'VIDEO', 'SYSTEM', 'TIP') NOT NULL DEFAULT 'TEXT';

ALTER TABLE `ChatMessage`
  ADD COLUMN `videoUrl` VARCHAR(191) NULL,
  ADD COLUMN `videoObjectKey` VARCHAR(191) NULL,
  ADD COLUMN `thumbnailUrl` VARCHAR(191) NULL,
  ADD COLUMN `thumbnailObjectKey` VARCHAR(191) NULL;
