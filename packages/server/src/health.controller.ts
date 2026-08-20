import { Controller, Get, Logger, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from './common/decorators/public.decorator';
import { PrismaService } from './prisma/prisma.service';
import { RedisService } from './redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) { }

  @Public()
  @Get()
  async check(@Res({ passthrough: true }) response: Response) {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const redis = this.redis.isReady() ? 'connected' : 'disconnected';
      if (redis === 'disconnected') response.status(503);
      return {
        status: redis === 'connected' ? 'ok' : 'degraded',
        db: 'connected',
        redis,
        timestamp: new Date().toISOString(),
      };
    } catch (e: any) {
      // 生产环境不向客户端暴露内部错误细节（SQL/路径等），详情仅写日志
      const isProd = process.env.NODE_ENV === 'production';
      if (isProd) Logger.error(`Health check failed: ${e.message}`, 'HealthController');
      response.status(503);
      return {
        status: 'degraded',
        db: 'disconnected',
        redis: this.redis.isReady() ? 'connected' : 'disconnected',
        error: isProd ? '数据库连接异常' : e.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
