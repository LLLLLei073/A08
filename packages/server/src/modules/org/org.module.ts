import { Module } from '@nestjs/common';
import { OrgController } from './org.controller';
import { OrgService } from './org.service';
import { StatisticsModule } from '../statistics/statistics.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [StatisticsModule, ChatModule],
  controllers: [OrgController],
  providers: [OrgService],
  exports: [OrgService],
})
export class OrgModule {}
