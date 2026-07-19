-- AlterTable
ALTER TABLE `ChatThread`
  ADD COLUMN `unlockedAt` DATETIME(3) NULL;

-- Backfill: without this, every already-unlocked thread would suddenly look
-- expired the instant this ships, forcing every existing conversation to
-- re-unlock with a Key on its very next reply. Approximate the unlock grant
-- as starting at the thread's last message time, so active conversations
-- stay valid and stale ones correctly need a fresh unlock.
UPDATE `ChatThread`
SET `unlockedAt` = `lastMessageAt`
WHERE `icebreakerUnlocked` = 1 AND `unlockedAt` IS NULL;
