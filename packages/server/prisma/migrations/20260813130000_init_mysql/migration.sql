-- CreateTable
CREATE TABLE `Org` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(128) NOT NULL,
    `parentId` INTEGER NULL,
    `level` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Org_parentId_idx`(`parentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(64) NOT NULL,
    `password` VARCHAR(255) NOT NULL,
    `name` VARCHAR(64) NOT NULL,
    `phone` VARCHAR(20) NULL,
    `orgId` INTEGER NOT NULL,
    `role` VARCHAR(20) NOT NULL DEFAULT 'MEMBER',
    `forceChangePassword` BOOLEAN NOT NULL DEFAULT true,
    `securityVersion` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_username_key`(`username`),
    INDEX `User_orgId_idx`(`orgId`),
    INDEX `User_role_idx`(`role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Content` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(255) NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `body` LONGTEXT NULL,
    `mediaUrl` VARCHAR(500) NULL,
    `cover` VARCHAR(500) NULL,
    `category` VARCHAR(64) NOT NULL,
    `tags` TEXT NOT NULL DEFAULT '[]',
    `isPublic` BOOLEAN NOT NULL DEFAULT false,
    `duration` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Content_category_idx`(`category`),
    INDEX `Content_isPublic_idx`(`isPublic`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LearningTask` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orgId` INTEGER NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `deadline` DATETIME(3) NOT NULL,
    `participantUserIds` TEXT NOT NULL DEFAULT '[]',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LearningTask_orgId_idx`(`orgId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LearningTaskContent` (
    `taskId` INTEGER NOT NULL,
    `contentId` INTEGER NOT NULL,

    PRIMARY KEY (`taskId`, `contentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LearningRecord` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `contentId` INTEGER NOT NULL,
    `duration` INTEGER NOT NULL DEFAULT 0,
    `progress` INTEGER NOT NULL DEFAULT 0,
    `completed` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LearningRecord_userId_idx`(`userId`),
    INDEX `LearningRecord_contentId_idx`(`contentId`),
    UNIQUE INDEX `LearningRecord_userId_contentId_key`(`userId`, `contentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LearningDailyStat` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `contentId` INTEGER NOT NULL,
    `day` DATE NOT NULL,
    `duration` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LearningDailyStat_userId_day_idx`(`userId`, `day`),
    INDEX `LearningDailyStat_day_idx`(`day`),
    UNIQUE INDEX `LearningDailyStat_userId_contentId_day_key`(`userId`, `contentId`, `day`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Question` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` VARCHAR(20) NOT NULL,
    `stem` TEXT NOT NULL,
    `options` TEXT NOT NULL,
    `answer` VARCHAR(64) NOT NULL,
    `analysis` TEXT NULL,
    `category` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Question_category_idx`(`category`),
    INDEX `Question_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Paper` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(255) NOT NULL,
    `totalScore` INTEGER NOT NULL,
    `passScore` INTEGER NOT NULL,
    `duration` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaperQuestion` (
    `paperId` INTEGER NOT NULL,
    `questionId` INTEGER NOT NULL,
    `score` INTEGER NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,

    INDEX `PaperQuestion_questionId_idx`(`questionId`),
    PRIMARY KEY (`paperId`, `questionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Quiz` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `paperId` INTEGER NOT NULL,
    `orgId` INTEGER NOT NULL,
    `type` VARCHAR(20) NOT NULL DEFAULT 'PRACTICE',
    `startTime` DATETIME(3) NOT NULL,
    `endTime` DATETIME(3) NOT NULL,
    `duration` INTEGER NOT NULL,
    `participantUserIds` TEXT NOT NULL DEFAULT '[]',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Quiz_paperId_idx`(`paperId`),
    INDEX `Quiz_orgId_idx`(`orgId`),
    INDEX `Quiz_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuizRecord` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `quizId` INTEGER NOT NULL,
    `answers` LONGTEXT NOT NULL,
    `score` INTEGER NULL,
    `passed` BOOLEAN NULL,
    `startTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `submitTime` DATETIME(3) NULL,

    INDEX `QuizRecord_userId_idx`(`userId`),
    INDEX `QuizRecord_quizId_idx`(`quizId`),
    UNIQUE INDEX `QuizRecord_userId_quizId_key`(`userId`, `quizId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WrongQuestion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `questionId` INTEGER NOT NULL,
    `wrongCount` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `WrongQuestion_userId_idx`(`userId`),
    UNIQUE INDEX `WrongQuestion_userId_questionId_key`(`userId`, `questionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiReport` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `score` INTEGER NOT NULL,
    `comment` TEXT NOT NULL,
    `strengths` TEXT NOT NULL DEFAULT '[]',
    `weaknesses` TEXT NOT NULL DEFAULT '[]',
    `suggestions` TEXT NOT NULL DEFAULT '[]',
    `dimensions` TEXT NOT NULL,
    `weekStart` DATETIME(3) NOT NULL,
    `periodEnd` DATETIME(3) NULL,
    `periodType` VARCHAR(20) NOT NULL DEFAULT 'WEEKLY',
    `source` VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
    `publishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AiReport_userId_idx`(`userId`),
    INDEX `AiReport_publishedAt_idx`(`publishedAt`),
    UNIQUE INDEX `AiReport_userId_weekStart_periodType_key`(`userId`, `weekStart`, `periodType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatGroup` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(128) NOT NULL,
    `type` VARCHAR(20) NOT NULL DEFAULT 'CUSTOM',
    `orgId` INTEGER NULL,
    `ownerId` INTEGER NULL,
    `notice` TEXT NULL,
    `archived` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ChatGroup_type_idx`(`type`),
    INDEX `ChatGroup_orgId_idx`(`orgId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatMember` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `groupId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `groupRole` VARCHAR(20) NOT NULL DEFAULT 'MEMBER',
    `lastReadMessageId` INTEGER NOT NULL DEFAULT 0,
    `muted` BOOLEAN NOT NULL DEFAULT false,
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ChatMember_userId_idx`(`userId`),
    UNIQUE INDEX `ChatMember_groupId_userId_key`(`groupId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatMessage` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `groupId` INTEGER NOT NULL,
    `senderId` INTEGER NULL,
    `type` VARCHAR(20) NOT NULL DEFAULT 'TEXT',
    `content` TEXT NOT NULL,
    `extra` TEXT NULL,
    `recalled` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ChatMessage_groupId_id_idx`(`groupId`, `id`),
    INDEX `ChatMessage_senderId_idx`(`senderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(255) NOT NULL,
    `content` TEXT NOT NULL,
    `type` VARCHAR(20) NOT NULL DEFAULT 'ANNOUNCE',
    `level` VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
    `senderId` INTEGER NULL,
    `scope` VARCHAR(20) NOT NULL DEFAULT 'ORG',
    `orgIds` TEXT NOT NULL DEFAULT '[]',
    `userIds` TEXT NOT NULL DEFAULT '[]',
    `refId` INTEGER NULL,
    `groupId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_type_idx`(`type`),
    INDEX `Notification_senderId_idx`(`senderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NotificationRecipient` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `notificationId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `NotificationRecipient_userId_isRead_idx`(`userId`, `isRead`),
    UNIQUE INDEX `NotificationRecipient_notificationId_userId_key`(`notificationId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Setting` (
    `key` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Org` ADD CONSTRAINT `Org_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `Org`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `Org`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LearningTask` ADD CONSTRAINT `LearningTask_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `Org`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LearningTaskContent` ADD CONSTRAINT `LearningTaskContent_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `LearningTask`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LearningTaskContent` ADD CONSTRAINT `LearningTaskContent_contentId_fkey` FOREIGN KEY (`contentId`) REFERENCES `Content`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LearningRecord` ADD CONSTRAINT `LearningRecord_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LearningRecord` ADD CONSTRAINT `LearningRecord_contentId_fkey` FOREIGN KEY (`contentId`) REFERENCES `Content`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LearningDailyStat` ADD CONSTRAINT `LearningDailyStat_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LearningDailyStat` ADD CONSTRAINT `LearningDailyStat_contentId_fkey` FOREIGN KEY (`contentId`) REFERENCES `Content`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaperQuestion` ADD CONSTRAINT `PaperQuestion_paperId_fkey` FOREIGN KEY (`paperId`) REFERENCES `Paper`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaperQuestion` ADD CONSTRAINT `PaperQuestion_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Quiz` ADD CONSTRAINT `Quiz_paperId_fkey` FOREIGN KEY (`paperId`) REFERENCES `Paper`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Quiz` ADD CONSTRAINT `Quiz_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `Org`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuizRecord` ADD CONSTRAINT `QuizRecord_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuizRecord` ADD CONSTRAINT `QuizRecord_quizId_fkey` FOREIGN KEY (`quizId`) REFERENCES `Quiz`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WrongQuestion` ADD CONSTRAINT `WrongQuestion_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WrongQuestion` ADD CONSTRAINT `WrongQuestion_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AiReport` ADD CONSTRAINT `AiReport_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatGroup` ADD CONSTRAINT `ChatGroup_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `Org`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatGroup` ADD CONSTRAINT `ChatGroup_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatMember` ADD CONSTRAINT `ChatMember_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `ChatGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatMember` ADD CONSTRAINT `ChatMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatMessage` ADD CONSTRAINT `ChatMessage_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `ChatGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatMessage` ADD CONSTRAINT `ChatMessage_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NotificationRecipient` ADD CONSTRAINT `NotificationRecipient_notificationId_fkey` FOREIGN KEY (`notificationId`) REFERENCES `Notification`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NotificationRecipient` ADD CONSTRAINT `NotificationRecipient_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
