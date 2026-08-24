-- Creator preference: auto-approve incoming booking proposals instead of
-- leaving them PROPOSED for a manual tap. Additive and defaulted, so existing
-- rows keep today's behaviour (manual approval) with no backfill needed.
--
-- Table is `users`, not `User`: the Prisma model carries @@map("users").
ALTER TABLE `users` ADD COLUMN `autoAcceptBookings` BOOLEAN NOT NULL DEFAULT false;
