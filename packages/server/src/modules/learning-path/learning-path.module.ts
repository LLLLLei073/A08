import { Module } from '@nestjs/common';
import { LearningEventService } from './learning-event.service';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { LearningPathController } from './learning-path.controller';
import { LearningPathService } from './learning-path.service';

@Module({
  imports: [KnowledgeModule],
  controllers: [LearningPathController],
  providers: [LearningEventService, LearningPathService],
  exports: [LearningEventService, LearningPathService],
})
export class LearningPathModule {}
