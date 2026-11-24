CREATE TABLE `VaultFolder` (
 `id` VARCHAR(191) NOT NULL, `codeGroupId` VARCHAR(191) NOT NULL,
 `parentId` VARCHAR(191) NULL, `name` VARCHAR(255) NOT NULL,
 `systemKey` VARCHAR(32) NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`id`), UNIQUE INDEX `VaultFolder_codeGroupId_systemKey_key` (`codeGroupId`,`systemKey`),
 INDEX `VaultFolder_codeGroupId_parentId_idx` (`codeGroupId`,`parentId`),
 CONSTRAINT `VaultFolder_codeGroupId_fkey` FOREIGN KEY (`codeGroupId`) REFERENCES `ChatPrivateCodeGroup` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `SecureFolderMessage` ADD COLUMN `folderId` VARCHAR(191) NULL, ADD COLUMN `displayName` VARCHAR(255) NULL;
