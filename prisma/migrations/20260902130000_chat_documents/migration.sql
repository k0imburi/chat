-- Add private document attachments to chat messages.
ALTER TABLE `ChatMessage` MODIFY COLUMN `type` ENUM('TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT', 'SYSTEM', 'TIP') NOT NULL DEFAULT 'TEXT';
ALTER TABLE `ChatMessage` ADD COLUMN `documentObjectKey` VARCHAR(191) NULL,
    ADD COLUMN `documentName` VARCHAR(191) NULL,
    ADD COLUMN `documentMimeType` VARCHAR(191) NULL,
    ADD COLUMN `documentSizeBytes` INTEGER NULL;
