import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * 设计目标：Redis 是“可选”依赖。
 *  - 不可用时所有读方法返回 null / false，写方法静默失败，**绝不抛异常到上层**。
 *  - 这样 AI 推荐等接口会自动退化为“无缓存”模式（直接走 DB / LLM），而不是 500。
 *  - Redis 恢复后会自动重连，无需重启服务。
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  /** 是否已成功建立连接（用于上层主动判断 / 健康检查） */
  private connected = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const host = this.config.get<string>('REDIS_HOST', 'localhost');
    const port = this.config.get<number>('REDIS_PORT', 6379);
    const password = this.config.get<string>('REDIS_PASSWORD') || undefined;
    try {
      this.client = new Redis({
        host,
        port,
        password,
        // 连接建立超时：避免每次请求卡 ~10s 才抛错（直接导致前端加载缓慢）
        connectTimeout: 2_000,
        // 离线时不排队，立即失败（由本 Service 统一捕获并降级）
        enableOfflineQueue: false,
        // 单条命令失败不重试（由本 Service 统一捕获并降级，避免叠加超时让前端更慢）
        maxRetriesPerRequest: 0,
        // 重连策略：指数退避 200ms * 2^n，封顶 3s；Redis 恢复后自动重连
        retryStrategy: (times: number) => Math.min(200 * Math.pow(2, times), 3_000),
      });

      this.client.on('connect', () => {
        this.logger.log(`Redis connecting to ${host}:${port} ...`);
      });
      this.client.on('ready', () => {
        if (!this.connected) {
          this.logger.log(`✅ Redis ready at ${host}:${port}`);
        }
        this.connected = true;
      });
      this.client.on('reconnecting', (delay: number) => {
        this.connected = false;
        this.logger.warn(`Redis reconnecting in ${delay}ms ...`);
      });
      this.client.on('end', () => {
        this.connected = false;
        this.logger.warn('Redis connection ended');
      });
      this.client.on('error', (err: Error) => {
        // ioredis 的 error 事件必须监听，否则会抛到 process 上一层
        // 降级模式下对常见断连错误只静默处理，避免日志爆炸
        if (!/ECONNREFUSED|ETIMEDOUT|Connection is closed|ENOTFOUND/.test(err.message)) {
          this.logger.warn(`Redis error (non-fatal): ${err.message}`);
        }
      });
    } catch (e: any) {
      this.logger.warn(`Redis init failed (non-fatal): ${e.message}`);
      this.client = null;
    }
  }

  async onModuleDestroy() {
    try {
      await this.client?.quit();
    } catch {
      // ignore
    }
  }

  /** 当前是否可用（用于上层主动判断 / 健康检查） */
  isReady(): boolean {
    return this.connected && this.client?.status === 'ready';
  }

  async get<T = string>(key: string): Promise<T | null> {
    if (!this.client) return null;
    try {
      const v = await this.client.get(key);
      if (!v) return null;
      try {
        return JSON.parse(v) as T;
      } catch {
        return v as unknown as T;
      }
    } catch (e: any) {
      this.logDegraded('get', key, e);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    if (!this.client) return;
    try {
      const v = typeof value === 'string' ? value : JSON.stringify(value);
      if (ttlSeconds) {
        await this.client.set(key, v, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, v);
      }
    } catch (e: any) {
      this.logDegraded('set', key, e);
    }
  }

  async del(key: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.del(key);
    } catch (e: any) {
      this.logDegraded('del', key, e);
    }
  }

  /**
   * 按前缀删除缓存键（SCAN 游标遍历，避免 KEYS 阻塞 Redis）。
   * 供写操作失效服务端 HTTP 缓存使用，例如 http-cache: 前缀。
   */
  async delByPrefix(prefix: string): Promise<void> {
    if (!this.client) return;
    try {
      let cursor = '0';
      do {
        const [next, keys] = await this.client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
        if (keys.length) await this.client.del(...keys);
        cursor = next;
      } while (cursor !== '0');
    } catch (e: any) {
      this.logDegraded('delByPrefix', prefix, e);
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.client) return false;
    try {
      return (await this.client.exists(key)) === 1;
    } catch (e: any) {
      this.logDegraded('exists', key, e);
      return false;
    }
  }

  /** 同一错误短时间会大量重复，做 5s 节流避免日志爆炸 */
  private lastWarnAt = 0;
  private logDegraded(op: string, key: string, e: Error) {
    const now = Date.now();
    if (now - this.lastWarnAt > 5_000) {
      this.logger.warn(`Redis degraded (${op} ${key}): ${e.message} - 业务自动降级走无缓存路径`);
      this.lastWarnAt = now;
    }
  }
}
