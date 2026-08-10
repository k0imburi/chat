-- Dedupe marker for the "your call is live, join now" notice sent when a
-- booking's slot opens, so it goes out once instead of on every reconcile tick.
ALTER TABLE `CallBooking` ADD COLUMN `liveNoticeSentAt` DATETIME(3) NULL;
