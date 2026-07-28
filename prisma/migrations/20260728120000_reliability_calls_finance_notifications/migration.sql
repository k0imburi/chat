-- Reliability, calling policy, exact payouts, and branded notification sounds.

ALTER TABLE `users`
  ADD COLUMN `callsRestrictedUntil` DATETIME(3) NULL;

ALTER TABLE `ChatThread`
  ADD COLUMN `cycleStartedAt` DATETIME(3) NULL,
  ADD COLUMN `cycleIcebreakerId` VARCHAR(191) NULL,
  ADD COLUMN `cycleLockedReplyId` VARCHAR(191) NULL;

UPDATE `ChatThread` t
SET
  t.`cycleStartedAt` = COALESCE(t.`unlockedAt`, t.`createdAt`),
  t.`cycleIcebreakerId` = (
    SELECT m.`id` FROM `ChatMessage` m
    WHERE m.`threadId` = t.`id`
      AND m.`senderId` = t.`initiatorId`
      AND m.`type` <> 'TIP'
    ORDER BY m.`sentAt` ASC LIMIT 1
  ),
  t.`cycleLockedReplyId` = (
    SELECT m.`id` FROM `ChatMessage` m
    WHERE m.`threadId` = t.`id` AND m.`locked` = true
    ORDER BY m.`sentAt` DESC LIMIT 1
  );

ALTER TABLE `CallBooking`
  MODIFY COLUMN `status` ENUM('PROPOSED','COUNTER_PROPOSED','APPROVED','DECLINED','EXPIRED','CANCELLED','LIVE','COMPLETED','USER_NO_SHOW','CREATOR_NO_SHOW','UNDER_REVIEW','REFUNDED') NOT NULL DEFAULT 'PROPOSED',
  ADD COLUMN `originalStart` DATETIME(3) NULL,
  ADD COLUMN `originalEnd` DATETIME(3) NULL;

ALTER TABLE `CreatorStrike`
  ADD COLUMN `consumedAt` DATETIME(3) NULL;

ALTER TABLE `CreatorPayout`
  ADD COLUMN `grossAmountUsd` DECIMAL(12,2) NULL,
  ADD COLUMN `feeAmountUsd` DECIMAL(12,2) NULL,
  ADD COLUMN `netAmountUsd` DECIMAL(12,2) NULL,
  ADD COLUMN `exchangeRate` DECIMAL(12,4) NULL;

ALTER TABLE `WithdrawalRequest`
  ADD COLUMN `grossAmountUsd` DECIMAL(12,2) NULL,
  ADD COLUMN `feeAmountUsd` DECIMAL(12,2) NULL,
  ADD COLUMN `netAmountUsd` DECIMAL(12,2) NULL,
  ADD COLUMN `exchangeRate` DECIMAL(12,4) NULL,
  ADD COLUMN `netAmountKes` DECIMAL(12,2) NULL,
  ADD COLUMN `quoteExpiresAt` DATETIME(3) NULL;

ALTER TABLE `AppSettings`
  ADD COLUMN `withdrawalFeePercent` DECIMAL(5,2) NOT NULL DEFAULT 0;
UPDATE `AppSettings`
SET `withdrawalFeePercent` = `transactionFeePercent`
WHERE `withdrawalFeePercent` = 0;

CREATE TABLE `CreatorFine` (
  `id` VARCHAR(191) NOT NULL,
  `creatorId` VARCHAR(191) NOT NULL,
  `bookingId` VARCHAR(191) NOT NULL,
  `baseAmount` DECIMAL(12,2) NOT NULL,
  `ratePercent` DECIMAL(5,2) NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `currency` VARCHAR(191) NOT NULL DEFAULT 'KES',
  `reason` VARCHAR(191) NOT NULL,
  `status` ENUM('OUTSTANDING','SETTLED','REVERSED') NOT NULL DEFAULT 'OUTSTANDING',
  `settledAt` DATETIME(3) NULL,
  `reversedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `CreatorFine_bookingId_key`(`bookingId`),
  INDEX `CreatorFine_creatorId_status_createdAt_idx`(`creatorId`,`status`,`createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `CreatorFine_creatorId_fkey` FOREIGN KEY (`creatorId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `CreatorFine_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `CallBooking`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PayoutAllocation` (
  `id` VARCHAR(191) NOT NULL,
  `payoutId` VARCHAR(191) NOT NULL,
  `earningLotId` VARCHAR(191) NOT NULL,
  `amount` DECIMAL(14,4) NOT NULL,
  `amountKes` DECIMAL(12,2) NOT NULL,
  `currency` VARCHAR(191) NOT NULL DEFAULT 'KES',
  `status` ENUM('RESERVED','PAID','RELEASED') NOT NULL DEFAULT 'RESERVED',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `PayoutAllocation_payoutId_earningLotId_key`(`payoutId`,`earningLotId`),
  INDEX `PayoutAllocation_earningLotId_status_idx`(`earningLotId`,`status`),
  PRIMARY KEY (`id`),
  CONSTRAINT `PayoutAllocation_payoutId_fkey` FOREIGN KEY (`payoutId`) REFERENCES `CreatorPayout`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `PayoutAllocation_earningLotId_fkey` FOREIGN KEY (`earningLotId`) REFERENCES `EarningLot`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `NotificationSound` (
  `id` VARCHAR(191) NOT NULL,
  `assetKey` VARCHAR(191) NOT NULL,
  `displayName` VARCHAR(191) NOT NULL,
  `description` VARCHAR(191) NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `isDefault` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `NotificationSound_assetKey_key`(`assetKey`),
  INDEX `NotificationSound_isActive_sortOrder_idx`(`isActive`,`sortOrder`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `NotificationSound`
  (`id`,`assetKey`,`displayName`,`description`,`sortOrder`,`isActive`,`isDefault`,`updatedAt`)
VALUES
  (UUID(),'cat_pulse','Pulse','A crisp two-note alert',0,true,true,NOW(3)),
  (UUID(),'cat_ripple','Ripple','A soft rising notification',1,true,false,NOW(3)),
  (UUID(),'cat_glow','Glow','A warm, rounded chime',2,true,false,NOW(3)),
  (UUID(),'cat_chime','Chime','A bright ChatAndTip alert',3,true,false,NOW(3));

CREATE TABLE `DeviceInstallation` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `platform` VARCHAR(191) NOT NULL,
  `fcmToken` VARCHAR(191) NULL,
  `voipToken` VARCHAR(191) NULL,
  `deviceId` VARCHAR(191) NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `DeviceInstallation_fcmToken_key`(`fcmToken`),
  UNIQUE INDEX `DeviceInstallation_voipToken_key`(`voipToken`),
  UNIQUE INDEX `DeviceInstallation_userId_deviceId_key`(`userId`,`deviceId`),
  INDEX `DeviceInstallation_userId_isActive_idx`(`userId`,`isActive`),
  PRIMARY KEY (`id`),
  CONSTRAINT `DeviceInstallation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CallInvite` (
  `id` VARCHAR(191) NOT NULL,
  `bookingId` VARCHAR(191) NOT NULL,
  `callerId` VARCHAR(191) NOT NULL,
  `calleeId` VARCHAR(191) NOT NULL,
  `status` ENUM('RINGING','ANSWERED','DECLINED','CANCELLED','MISSED') NOT NULL DEFAULT 'RINGING',
  `expiresAt` DATETIME(3) NOT NULL,
  `answeredAt` DATETIME(3) NULL,
  `endedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `CallInvite_bookingId_status_idx`(`bookingId`,`status`),
  INDEX `CallInvite_calleeId_status_expiresAt_idx`(`calleeId`,`status`,`expiresAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `CallInvite_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `CallBooking`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `CallInvite_callerId_fkey` FOREIGN KEY (`callerId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `CallInvite_calleeId_fkey` FOREIGN KEY (`calleeId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Re-audit historical lateness deductions. Only confirmed creator no-shows
-- become fine debt; joined calls are reversed.
INSERT INTO `CreatorFine`
  (`id`,`creatorId`,`bookingId`,`baseAmount`,`ratePercent`,`amount`,`currency`,`reason`,`status`,`createdAt`,`updatedAt`)
SELECT
  UUID(), e.`userId`, b.`id`, ABS(e.`amount`) * 4, 25, ABS(e.`amount`), e.`currency`,
  'Confirmed creator no-show', 'OUTSTANDING', e.`createdAt`, NOW(3)
FROM `EarningLot` e
JOIN `CallBooking` b ON e.`sourceId` = CONCAT('late-fine:', b.`id`)
WHERE e.`amount` < 0 AND b.`status` = 'CREATOR_NO_SHOW'
ON DUPLICATE KEY UPDATE `bookingId` = VALUES(`bookingId`);

UPDATE `EarningLot`
SET `status` = 'REVERSED',
    `heldReason` = CONCAT(COALESCE(`heldReason`, 'Historical fine'), ' - migrated to creator fine audit')
WHERE `amount` < 0 AND `sourceId` LIKE 'late-fine:%';
