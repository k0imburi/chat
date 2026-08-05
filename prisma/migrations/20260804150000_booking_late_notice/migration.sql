-- Dedupe marker for the three-minute "both parties joined?" check, so the
-- late notice goes out once instead of on every reconcile tick.
ALTER TABLE `CallBooking` ADD COLUMN `lateNoticeSentAt` DATETIME(3) NULL;
