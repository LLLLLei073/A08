import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { DeepSeekClient } from './deepseek.client';
import { StatisticsModule } from '../statistics/statistics.module';
import { NotificationModule } from '../notification/notification.module';
import { ConversationalAnalyticsService } from './conversational-analytics.service';

@Module({
  imports: [StatisticsModule, NotificationModule],
  controllers: [AiController],
  providers: [AiService, DeepSeekClient, ConversationalAnalyticsService],
  exports: [AiService, DeepSeekClient],
})
export class AiModule {}
