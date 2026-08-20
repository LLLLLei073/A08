import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { EngagementController } from './engagement.controller';
import { EngagementService } from './engagement.service';

@Module({ imports: [NotificationModule], controllers: [EngagementController], providers: [EngagementService], exports: [EngagementService] })
export class EngagementModule {}
