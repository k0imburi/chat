ALTER TABLE `users`
  ADD COLUMN `nameChangeCount` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `lastNameChangedAt` DATETIME(3) NULL,
  ADD COLUMN `nameHistoryStartedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- Track every writer, including profile edits, provider sync and admin edits.
-- Initial account creation and whitespace-only edits are not name changes.
CREATE TRIGGER `users_track_name_changes`
BEFORE UPDATE ON `users`
FOR EACH ROW SET
  NEW.nameChangeCount = IF(
    NOT (BINARY TRIM(NEW.fullName) <=> BINARY TRIM(OLD.fullName)),
    OLD.nameChangeCount + 1, OLD.nameChangeCount),
  NEW.lastNameChangedAt = IF(
    NOT (BINARY TRIM(NEW.fullName) <=> BINARY TRIM(OLD.fullName)),
    CURRENT_TIMESTAMP(3), OLD.lastNameChangedAt),
  NEW.nameHistoryStartedAt = OLD.nameHistoryStartedAt;
