-- Match the 64-character language selection accepted by the mobile ads API.
ALTER TABLE `AdCampaign` MODIFY COLUMN `language` VARCHAR(64) NOT NULL DEFAULT 'en';
