-- ChatMessageType gained VIDEO, but the enum is used by TWO columns and the
-- earlier migration only widened ChatMessage.type. Writing a VIDEO message
-- then failed on the thread update with MySQL 1265 "Data truncated for column
-- 'lastMessageType'", surfacing as a 500 when sending any chat video.
ALTER TABLE `ChatThread`
  MODIFY COLUMN `lastMessageType` ENUM('TEXT', 'IMAGE', 'VIDEO', 'SYSTEM', 'TIP') NULL;
