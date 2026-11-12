ALTER TABLE `TechnicalIssue` ADD COLUMN `ticketNumber` INTEGER NULL;

-- Keep legacy labels intact (including any historical duplicates). The sequence
-- starts above the largest legacy label, never at the current row count.
CREATE TABLE `SupportTicketSequence` (
  `id` INTEGER NOT NULL,
  `value` INTEGER NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
INSERT INTO `SupportTicketSequence` (`id`, `value`)
SELECT 1, COALESCE(MAX(CAST(SUBSTRING_INDEX(`subject`, 'C#', -1) AS UNSIGNED)), 0)
FROM `TechnicalIssue` WHERE `subject` REGEXP '^Support chat · C#[0-9]+$';
CREATE UNIQUE INDEX `TechnicalIssue_ticketNumber_key` ON `TechnicalIssue` (`ticketNumber`);

CREATE TABLE `TechnicalIssueReply` (
  `id` VARCHAR(191) NOT NULL,
  `issueId` VARCHAR(191) NOT NULL,
  `authorId` VARCHAR(191) NOT NULL,
  `message` TEXT NOT NULL,
  `fromAdmin` BOOLEAN NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `TechnicalIssueReply_issueId_createdAt_id_idx` (`issueId`, `createdAt`, `id`),
  CONSTRAINT `TechnicalIssueReply_issueId_fkey` FOREIGN KEY (`issueId`) REFERENCES `TechnicalIssue` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `TechnicalIssueTyping` (
  `issueId` VARCHAR(191) NOT NULL,
  `agentId` VARCHAR(191) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`issueId`, `agentId`),
  CONSTRAINT `TechnicalIssueTyping_issueId_fkey` FOREIGN KEY (`issueId`) REFERENCES `TechnicalIssue` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
