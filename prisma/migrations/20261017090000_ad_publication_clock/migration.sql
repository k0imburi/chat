ALTER TABLE `AdCampaign` ADD COLUMN `publishedAt` DATETIME(3) NULL;
UPDATE `AdCampaign` SET `publishedAt` = COALESCE(`startDate`, `createdAt`)
WHERE `status` IN ('ACTIVE', 'PAUSED', 'COMPLETED') AND `checkoutPaid` = true AND `reviewStatus` = 'APPROVED';
