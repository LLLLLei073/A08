-- Knowledge graph, BKT mastery state, reliable learning events and explainable path snapshots.
CREATE TABLE `KnowledgeNode` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `description` TEXT NULL,
    `category` VARCHAR(64) NOT NULL,
    `difficulty` INTEGER NOT NULL DEFAULT 1,
    `pInit` DOUBLE NOT NULL DEFAULT 0.2,
    `pLearn` DOUBLE NOT NULL DEFAULT 0.15,
    `pSlip` DOUBLE NOT NULL DEFAULT 0.1,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `KnowledgeNode_code_key`(`code`),
    INDEX `KnowledgeNode_category_idx`(`category`),
    INDEX `KnowledgeNode_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `KnowledgeEdge` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fromNodeId` INTEGER NOT NULL,
    `toNodeId` INTEGER NOT NULL,
    `type` VARCHAR(32) NOT NULL DEFAULT 'PREREQUISITE',
    `weight` DOUBLE NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `KnowledgeEdge_toNodeId_idx`(`toNodeId`),
    UNIQUE INDEX `KnowledgeEdge_fromNodeId_toNodeId_type_key`(`fromNodeId`, `toNodeId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ContentKnowledge` (
    `contentId` INTEGER NOT NULL,
    `nodeId` INTEGER NOT NULL,
    `weight` DOUBLE NOT NULL DEFAULT 1,
    `difficulty` INTEGER NOT NULL DEFAULT 1,
    INDEX `ContentKnowledge_nodeId_idx`(`nodeId`),
    PRIMARY KEY (`contentId`, `nodeId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `QuestionKnowledge` (
    `questionId` INTEGER NOT NULL,
    `nodeId` INTEGER NOT NULL,
    `weight` DOUBLE NOT NULL DEFAULT 1,
    `difficulty` INTEGER NOT NULL DEFAULT 1,
    INDEX `QuestionKnowledge_nodeId_idx`(`nodeId`),
    PRIMARY KEY (`questionId`, `nodeId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `UserKnowledgeState` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `nodeId` INTEGER NOT NULL,
    `mastery` DOUBLE NOT NULL DEFAULT 0.2,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `correctCount` INTEGER NOT NULL DEFAULT 0,
    `lastEvidenceAt` DATETIME(3) NULL,
    `algorithmVersion` VARCHAR(32) NOT NULL DEFAULT 'bkt-v1',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `UserKnowledgeState_userId_mastery_idx`(`userId`, `mastery`),
    UNIQUE INDEX `UserKnowledgeState_userId_nodeId_key`(`userId`, `nodeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `LearningEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `orgId` INTEGER NOT NULL,
    `eventType` VARCHAR(32) NOT NULL,
    `subjectType` VARCHAR(32) NOT NULL,
    `subjectId` INTEGER NOT NULL,
    `sourceKey` VARCHAR(128) NOT NULL,
    `payload` TEXT NOT NULL,
    `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processedAt` DATETIME(3) NULL,
    `processingError` TEXT NULL,
    `retryCount` INTEGER NOT NULL DEFAULT 0,
    UNIQUE INDEX `LearningEvent_sourceKey_key`(`sourceKey`),
    INDEX `LearningEvent_userId_processedAt_idx`(`userId`, `processedAt`),
    INDEX `LearningEvent_processedAt_retryCount_idx`(`processedAt`, `retryCount`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `LearningPathSnapshot` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `algorithmVersion` VARCHAR(32) NOT NULL DEFAULT 'graph-bkt-v1',
    `graphVersion` INTEGER NOT NULL DEFAULT 1,
    `context` TEXT NOT NULL,
    `generatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `LearningPathSnapshot_userId_generatedAt_idx`(`userId`, `generatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `LearningPathItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `snapshotId` INTEGER NOT NULL,
    `nodeId` INTEGER NULL,
    `contentId` INTEGER NOT NULL,
    `rank` INTEGER NOT NULL,
    `score` DOUBLE NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `breakdown` TEXT NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    INDEX `LearningPathItem_nodeId_idx`(`nodeId`),
    INDEX `LearningPathItem_contentId_idx`(`contentId`),
    UNIQUE INDEX `LearningPathItem_snapshotId_rank_key`(`snapshotId`, `rank`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `KnowledgeEdge` ADD CONSTRAINT `KnowledgeEdge_fromNodeId_fkey` FOREIGN KEY (`fromNodeId`) REFERENCES `KnowledgeNode`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `KnowledgeEdge` ADD CONSTRAINT `KnowledgeEdge_toNodeId_fkey` FOREIGN KEY (`toNodeId`) REFERENCES `KnowledgeNode`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ContentKnowledge` ADD CONSTRAINT `ContentKnowledge_contentId_fkey` FOREIGN KEY (`contentId`) REFERENCES `Content`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ContentKnowledge` ADD CONSTRAINT `ContentKnowledge_nodeId_fkey` FOREIGN KEY (`nodeId`) REFERENCES `KnowledgeNode`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `QuestionKnowledge` ADD CONSTRAINT `QuestionKnowledge_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `QuestionKnowledge` ADD CONSTRAINT `QuestionKnowledge_nodeId_fkey` FOREIGN KEY (`nodeId`) REFERENCES `KnowledgeNode`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `UserKnowledgeState` ADD CONSTRAINT `UserKnowledgeState_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `UserKnowledgeState` ADD CONSTRAINT `UserKnowledgeState_nodeId_fkey` FOREIGN KEY (`nodeId`) REFERENCES `KnowledgeNode`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `LearningEvent` ADD CONSTRAINT `LearningEvent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `LearningEvent` ADD CONSTRAINT `LearningEvent_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `Org`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `LearningPathSnapshot` ADD CONSTRAINT `LearningPathSnapshot_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `LearningPathItem` ADD CONSTRAINT `LearningPathItem_snapshotId_fkey` FOREIGN KEY (`snapshotId`) REFERENCES `LearningPathSnapshot`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `LearningPathItem` ADD CONSTRAINT `LearningPathItem_nodeId_fkey` FOREIGN KEY (`nodeId`) REFERENCES `KnowledgeNode`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `LearningPathItem` ADD CONSTRAINT `LearningPathItem_contentId_fkey` FOREIGN KEY (`contentId`) REFERENCES `Content`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `AnalyticsQueryAudit` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `actorUserId` INTEGER NOT NULL,
    `orgId` INTEGER NOT NULL,
    `questionHash` VARCHAR(64) NOT NULL,
    `queryPlan` TEXT NOT NULL,
    `resultCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `AnalyticsQueryAudit_actorUserId_createdAt_idx`(`actorUserId`, `createdAt`),
    INDEX `AnalyticsQueryAudit_orgId_createdAt_idx`(`orgId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AnalyticsQueryAudit` ADD CONSTRAINT `AnalyticsQueryAudit_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AnalyticsQueryAudit` ADD CONSTRAINT `AnalyticsQueryAudit_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `Org`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `EngagementRiskSnapshot` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `orgId` INTEGER NOT NULL,
    `score` INTEGER NOT NULL,
    `level` VARCHAR(16) NOT NULL,
    `factors` TEXT NOT NULL,
    `ruleVersion` VARCHAR(32) NOT NULL DEFAULT 'engagement-rules-v1',
    `evaluatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastNotifiedAt` DATETIME(3) NULL,
    UNIQUE INDEX `EngagementRiskSnapshot_userId_key`(`userId`),
    INDEX `EngagementRiskSnapshot_orgId_score_idx`(`orgId`, `score`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `EngagementRiskSnapshot` ADD CONSTRAINT `EngagementRiskSnapshot_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `EngagementRiskSnapshot` ADD CONSTRAINT `EngagementRiskSnapshot_orgId_fkey` FOREIGN KEY (`orgId`) REFERENCES `Org`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
