import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'path';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { OrgModule } from './modules/org/org.module';
import { UserModule } from './modules/user/user.module';
import { ContentModule } from './modules/content/content.module';
import { TaskModule } from './modules/task/task.module';
import { QuestionModule } from './modules/question/question.module';
import { PaperModule } from './modules/paper/paper.module';
import { QuizModule } from './modules/quiz/quiz.module';
import { StatisticsModule } from './modules/statistics/statistics.module';
import { UploadModule } from './modules/upload/upload.module';
import { AiModule } from './modules/ai/ai.module';
import { SettingsModule } from './modules/settings/settings.module';
import { ChatModule } from './modules/chat/chat.module';
import { NotificationModule } from './modules/notification/notification.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { LearningPathModule } from './modules/learning-path/learning-path.module';
import { EngagementModule } from './modules/engagement/engagement.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    // 固定从 server 包目录读取 .env，避免从不同 cwd 启动时加载到不同密钥。
    // src/app.module.ts 与 dist/app.module.js 的上一级均为 packages/server。
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [resolve(__dirname, '../.env'), resolve(process.cwd(), '.env')],
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    PrismaModule,
    RedisModule,
    AuthModule,
    OrgModule,
    UserModule,
    ContentModule,
    TaskModule,
    QuestionModule,
    PaperModule,
    QuizModule,
    StatisticsModule,
    UploadModule,
    AiModule,
    SettingsModule,
    ChatModule,
    NotificationModule,
    KnowledgeModule,
    LearningPathModule,
    EngagementModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
