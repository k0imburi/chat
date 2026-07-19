-- Existing NULL/empty usernames were backfilled from fullName (or email
-- local-part as fallback) directly against production before this migration,
-- so every row is already unique by the time this index is created.
CREATE UNIQUE INDEX `users_username_key` ON `users`(`username`);
