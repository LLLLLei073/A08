-- 每个群成员独立记录清空位置，不删除群内共享消息。
ALTER TABLE `ChatMember`
    ADD COLUMN `clearedMessageId` INTEGER NOT NULL DEFAULT 0;
