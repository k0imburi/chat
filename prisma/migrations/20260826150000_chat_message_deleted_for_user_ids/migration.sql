-- Per-user soft delete for chat messages: deleting your own sent message
-- only hides it from your own view, not the other participant's.
ALTER TABLE `ChatMessage` ADD COLUMN `deletedForUserIds` JSON NULL;
