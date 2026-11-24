ALTER TABLE `AppSettings` ADD COLUMN `googleOAuthClientIds` TEXT NULL, ADD COLUMN `appleOAuthAudiences` TEXT NULL;
ALTER TABLE `users` ADD COLUMN `availabilityConfigured` BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE `users` ALTER COLUMN `availabilityConfigured` SET DEFAULT false;
