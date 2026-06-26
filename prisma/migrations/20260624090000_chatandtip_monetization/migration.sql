-- ChatAndTip monetization, private paid content, scheduling, earnings and payouts.
-- Existing credit/chat tables were introduced through the current schema before
-- migration tracking; this migration makes the new production additions explicit.

ALTER TABLE `users`
  ADD COLUMN `earningSuspendedUntil` DATETIME(3) NULL,
  ADD COLUMN `activeStrikeCount` INTEGER NOT NULL DEFAULT 0;

ALTER TABLE `CreditAccount`
  ADD COLUMN `reservedVoiceSessions` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `reservedVideoSessions` INTEGER NOT NULL DEFAULT 0;

ALTER TABLE `CreditPurchase`
  ADD COLUMN `provider` VARCHAR(191) NOT NULL DEFAULT 'MPESA',
  ADD COLUMN `stripeSessionId` VARCHAR(191) NULL,
  ADD COLUMN `pricingSnapshot` JSON NULL,
  ADD COLUMN `exchangeRate` DECIMAL(12,4) NULL,
  ADD COLUMN `paymentAttemptId` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `CreditPurchase_stripeSessionId_key` ON `CreditPurchase`(`stripeSessionId`);
CREATE UNIQUE INDEX `CreditPurchase_paymentAttemptId_key` ON `CreditPurchase`(`paymentAttemptId`);

ALTER TABLE `Tip`
  ADD COLUMN `reviewStatus` VARCHAR(191) NOT NULL DEFAULT 'CLEAR',
  ADD COLUMN `exchangeRate` DECIMAL(12,4) NULL;

CREATE TABLE `TipPurchase` (
  `id` VARCHAR(191) NOT NULL, `senderId` VARCHAR(191) NOT NULL, `receiverId` VARCHAR(191) NOT NULL,
  `tier` ENUM('PEBBLE','GEM','DIAMOND') NOT NULL, `amountUsd` DECIMAL(10,2) NOT NULL,
  `totalKes` DECIMAL(12,2) NOT NULL, `exchangeRate` DECIMAL(12,4) NOT NULL, `phone` VARCHAR(191) NOT NULL,
  `checkoutRequestId` VARCHAR(191) NULL, `stripeSessionId` VARCHAR(191) NULL, `provider` VARCHAR(191) NOT NULL DEFAULT 'MPESA', `paymentAttemptId` VARCHAR(191) NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING', `recorded` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `TipPurchase_checkoutRequestId_key`(`checkoutRequestId`), UNIQUE INDEX `TipPurchase_stripeSessionId_key`(`stripeSessionId`), UNIQUE INDEX `TipPurchase_paymentAttemptId_key`(`paymentAttemptId`), INDEX `TipPurchase_senderId_createdAt_idx`(`senderId`,`createdAt`),
  INDEX `TipPurchase_receiverId_createdAt_idx`(`receiverId`,`createdAt`), PRIMARY KEY (`id`),
  CONSTRAINT `TipPurchase_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `TipPurchase_receiverId_fkey` FOREIGN KEY (`receiverId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PaymentAttempt` (
  `id` VARCHAR(191) NOT NULL, `userId` VARCHAR(191) NULL,
  `provider` ENUM('MPESA','STRIPE','GOOGLE_PLAY','APP_STORE') NOT NULL,
  `purpose` ENUM('CREDIT_PURCHASE','TIP','PAYOUT') NOT NULL,
  `status` ENUM('CREATED','SUBMITTING','PENDING','VERIFYING','FULFILLING','SUCCEEDED','FAILED','CANCELLED','REQUIRES_REVIEW') NOT NULL DEFAULT 'CREATED',
  `amount` DECIMAL(12,2) NOT NULL, `currency` VARCHAR(191) NOT NULL DEFAULT 'KES', `expectedPhone` VARCHAR(191) NULL,
  `idempotencyKey` VARCHAR(191) NOT NULL, `merchantRequestId` VARCHAR(191) NULL, `checkoutRequestId` VARCHAR(191) NULL,
  `providerReceipt` VARCHAR(191) NULL, `resultCode` INTEGER NULL, `callbackReceivedAt` DATETIME(3) NULL,
  `verifiedAt` DATETIME(3) NULL, `fulfilledAt` DATETIME(3) NULL, `failureReason` TEXT NULL, `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `PaymentAttempt_idempotencyKey_key`(`idempotencyKey`),
  UNIQUE INDEX `PaymentAttempt_merchantRequestId_key`(`merchantRequestId`),
  UNIQUE INDEX `PaymentAttempt_checkoutRequestId_key`(`checkoutRequestId`),
  UNIQUE INDEX `PaymentAttempt_providerReceipt_key`(`providerReceipt`),
  INDEX `PaymentAttempt_provider_status_createdAt_idx`(`provider`,`status`,`createdAt`), INDEX `PaymentAttempt_userId_createdAt_idx`(`userId`,`createdAt`),
  PRIMARY KEY (`id`), CONSTRAINT `PaymentAttempt_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PaymentWebhookEvent` (
  `id` VARCHAR(191) NOT NULL, `attemptId` VARCHAR(191) NULL, `provider` ENUM('MPESA','STRIPE','GOOGLE_PLAY','APP_STORE') NOT NULL,
  `eventKey` VARCHAR(191) NOT NULL, `payloadHash` VARCHAR(191) NOT NULL, `resultCode` INTEGER NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'RECEIVED', `metadata` JSON NULL,
  `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `processedAt` DATETIME(3) NULL,
  UNIQUE INDEX `PaymentWebhookEvent_eventKey_key`(`eventKey`), INDEX `PaymentWebhookEvent_attemptId_receivedAt_idx`(`attemptId`,`receivedAt`),
  INDEX `PaymentWebhookEvent_provider_receivedAt_idx`(`provider`,`receivedAt`), PRIMARY KEY (`id`),
  CONSTRAINT `PaymentWebhookEvent_attemptId_fkey` FOREIGN KEY (`attemptId`) REFERENCES `PaymentAttempt`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CreditPurchase` ADD CONSTRAINT `CreditPurchase_paymentAttemptId_fkey` FOREIGN KEY (`paymentAttemptId`) REFERENCES `PaymentAttempt`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `TipPurchase` ADD CONSTRAINT `TipPurchase_paymentAttemptId_fkey` FOREIGN KEY (`paymentAttemptId`) REFERENCES `PaymentAttempt`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `ChatThread`
  ADD COLUMN `kind` ENUM('DIRECT','BROADCAST') NOT NULL DEFAULT 'DIRECT',
  ADD COLUMN `broadcastOnly` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `campaignId` VARCHAR(191) NULL;

ALTER TABLE `ChatMessage`
  ADD COLUMN `imageObjectKey` VARCHAR(191) NULL,
  ADD COLUMN `broadcastCampaignId` VARCHAR(191) NULL;
CREATE INDEX `ChatMessage_broadcastCampaignId_idx` ON `ChatMessage`(`broadcastCampaignId`);

ALTER TABLE `AppSettings` ADD COLUMN `r2PrivateBucketName` VARCHAR(191) NULL;

ALTER TABLE `VerificationCode`
  MODIFY COLUMN `purpose` ENUM('PHONE_LOGIN','PASSWORD_RESET','PAYOUT_PHONE') NOT NULL;

CREATE TABLE `CreatorAvailability` (
  `id` VARCHAR(191) NOT NULL, `userId` VARCHAR(191) NOT NULL, `weekday` INTEGER NOT NULL,
  `startMinute` INTEGER NOT NULL, `endMinute` INTEGER NOT NULL, `timezone` VARCHAR(191) NOT NULL,
  `voiceEnabled` BOOLEAN NOT NULL DEFAULT true, `videoEnabled` BOOLEAN NOT NULL DEFAULT true,
  `maxSessionsDay` INTEGER NOT NULL DEFAULT 1, `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  INDEX `CreatorAvailability_userId_weekday_isActive_idx`(`userId`,`weekday`,`isActive`), PRIMARY KEY (`id`),
  CONSTRAINT `CreatorAvailability_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CallBooking` (
  `id` VARCHAR(191) NOT NULL, `customerId` VARCHAR(191) NOT NULL, `creatorId` VARCHAR(191) NOT NULL,
  `type` ENUM('VOICE','VIDEO') NOT NULL,
  `status` ENUM('PROPOSED','APPROVED','DECLINED','EXPIRED','CANCELLED','LIVE','COMPLETED','USER_NO_SHOW','CREATOR_NO_SHOW','UNDER_REVIEW','REFUNDED') NOT NULL DEFAULT 'PROPOSED',
  `timezone` VARCHAR(191) NOT NULL, `scheduledStart` DATETIME(3) NOT NULL, `scheduledEnd` DATETIME(3) NOT NULL,
  `proposalExpiresAt` DATETIME(3) NOT NULL, `channelId` VARCHAR(191) NOT NULL,
  `customerJoinedAt` DATETIME(3) NULL, `creatorJoinedAt` DATETIME(3) NULL, `approvedAt` DATETIME(3) NULL,
  `declinedAt` DATETIME(3) NULL, `cancelledAt` DATETIME(3) NULL, `completedAt` DATETIME(3) NULL,
  `creatorFineAppliedAt` DATETIME(3) NULL, `reminderSentAt` DATETIME(3) NULL, `endReason` TEXT NULL,
  `reviewDecision` VARCHAR(191) NULL, `reviewedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `CallBooking_channelId_key`(`channelId`), UNIQUE INDEX `CallBooking_creatorId_scheduledStart_key`(`creatorId`,`scheduledStart`),
  INDEX `CallBooking_creatorId_scheduledStart_status_idx`(`creatorId`,`scheduledStart`,`status`),
  INDEX `CallBooking_customerId_scheduledStart_status_idx`(`customerId`,`scheduledStart`,`status`),
  INDEX `CallBooking_status_proposalExpiresAt_idx`(`status`,`proposalExpiresAt`), PRIMARY KEY (`id`),
  CONSTRAINT `CallBooking_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `CallBooking_creatorId_fkey` FOREIGN KEY (`creatorId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CreatorStrike` (
  `id` VARCHAR(191) NOT NULL, `creatorId` VARCHAR(191) NOT NULL, `bookingId` VARCHAR(191) NULL,
  `reason` VARCHAR(191) NOT NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `expiresAt` DATETIME(3) NULL,
  UNIQUE INDEX `CreatorStrike_bookingId_key`(`bookingId`), INDEX `CreatorStrike_creatorId_createdAt_idx`(`creatorId`,`createdAt`), PRIMARY KEY (`id`),
  CONSTRAINT `CreatorStrike_creatorId_fkey` FOREIGN KEY (`creatorId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `EarningLot` (
  `id` VARCHAR(191) NOT NULL, `userId` VARCHAR(191) NOT NULL,
  `source` ENUM('KEY','CHAT_CREDIT','VOICE_SESSION','VIDEO_SESSION','TIP') NOT NULL, `sourceId` VARCHAR(191) NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL, `currency` VARCHAR(191) NOT NULL DEFAULT 'KES',
  `status` ENUM('PENDING','HELD','AVAILABLE','RESERVED','PAID','REVERSED') NOT NULL DEFAULT 'PENDING',
  `settledAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `availableAt` DATETIME(3) NOT NULL,
  `heldReason` VARCHAR(191) NULL, `payoutId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `EarningLot_source_sourceId_userId_key`(`source`,`sourceId`,`userId`),
  INDEX `EarningLot_userId_status_availableAt_idx`(`userId`,`status`,`availableAt`), PRIMARY KEY (`id`),
  CONSTRAINT `EarningLot_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CreatorKyc` (
  `id` VARCHAR(191) NOT NULL, `userId` VARCHAR(191) NOT NULL,
  `status` ENUM('NOT_SUBMITTED','PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'NOT_SUBMITTED',
  `idFrontObjectKey` VARCHAR(191) NULL, `idBackObjectKey` VARCHAR(191) NULL, `selfieObjectKey` VARCHAR(191) NULL,
  `rejectionReason` TEXT NULL, `submittedAt` DATETIME(3) NULL, `reviewedAt` DATETIME(3) NULL, `reviewerId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `CreatorKyc_userId_key`(`userId`), PRIMARY KEY (`id`),
  CONSTRAINT `CreatorKyc_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PayoutProfile` (
  `id` VARCHAR(191) NOT NULL, `userId` VARCHAR(191) NOT NULL, `mpesaPhone` VARCHAR(191) NULL,
  `phoneVerifiedAt` DATETIME(3) NULL, `destinationChangedAt` DATETIME(3) NULL,
  `automaticEnabled` BOOLEAN NOT NULL DEFAULT true, `pausedReason` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `PayoutProfile_userId_key`(`userId`), PRIMARY KEY (`id`),
  CONSTRAINT `PayoutProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CreatorPayout` (
  `id` VARCHAR(191) NOT NULL, `userId` VARCHAR(191) NOT NULL, `amount` DECIMAL(12,2) NOT NULL,
  `currency` VARCHAR(191) NOT NULL DEFAULT 'KES', `status` ENUM('PENDING','PROCESSING','SUCCEEDED','FAILED') NOT NULL DEFAULT 'PENDING',
  `destination` VARCHAR(191) NOT NULL, `provider` VARCHAR(191) NOT NULL DEFAULT 'MPESA_B2C',
  `providerReference` VARCHAR(191) NULL, `attempts` INTEGER NOT NULL DEFAULT 0, `failureReason` TEXT NULL,
  `processedAt` DATETIME(3) NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `CreatorPayout_providerReference_key`(`providerReference`), INDEX `CreatorPayout_status_createdAt_idx`(`status`,`createdAt`),
  INDEX `CreatorPayout_userId_createdAt_idx`(`userId`,`createdAt`), PRIMARY KEY (`id`),
  CONSTRAINT `CreatorPayout_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `EarningLot` ADD CONSTRAINT `EarningLot_payoutId_fkey` FOREIGN KEY (`payoutId`) REFERENCES `CreatorPayout`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
