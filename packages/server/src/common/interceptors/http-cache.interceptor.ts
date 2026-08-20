import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request, Response } from 'express';
import { RedisService } from '../../redis/redis.service';

interface Rule {
  /** 仅匹配 path（不含 query）；白名单按「共享、非用户相关」只读接口严格收口 */
  re: RegExp;
  /** 缓存秒数 */
  ttl: number;
}

/**
 * 服务端只读接口缓存（白名单 + Redis）。
 *
 * 与前端 Pinia TTL 缓存（utils/cache.ts）互补：
 *  - 前端 TTL 减少「同会话重复请求」；
 *  - 本拦截器减少「跨用户 / 跨会话的服务端计算与 DB 查询」，并允许浏览器 / CDN 共享缓存。
 *
 * 安全原则（防跨用户数据泄漏）：
 *  - 仅白名单内的共享只读接口参与 public 缓存；
 *  - 其余 GET（含 /auth/me、/tasks/my、/quizzes/my 等用户相关接口）一律 `private, no-cache`，
 *    即仅浏览器私有缓存且需重新校验，绝不进入共享缓存；
 *  - 非 GET（写操作）置 `no-store`。
 *
 * Redis 不可用时（RedisService.isReady() 为 false）优雅降级：仅设置 Cache-Control，不读写缓存，
 * 业务自动走「无缓存」路径（与 RedisService 的整体降级策略一致）。
 *
 * 实现要点：本拦截器注册在 TransformInterceptor 之后（即最内层），其 `next.handle()` 拿到的是
 * 控制器原始返回值（未经信封包装），缓存该值；命中时直接 `of(缓存对象)` 返回，外层 TransformInterceptor
 * 仍会把它包成 `{ code, message, data }`，故命中与未命中的线上报文完全一致。
 */
const WHITELIST: Rule[] = [
  { re: /^\/api\/orgs\/tree$/, ttl: 300 },
  { re: /^\/api\/contents\/categories$/, ttl: 300 },
  { re: /^\/api\/questions\/categories$/, ttl: 300 },
];

@Injectable()
export class HttpCacheInterceptor implements NestInterceptor {
  constructor(private readonly redis: RedisService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    if (req.method !== 'GET') {
      res.set('Cache-Control', 'no-store');
      // 写操作会改变白名单只读接口的数据（组织树/统计/分类等），必须清空服务端缓存。
      // 注意必须 await：前端收到写响应后会立即重新拉取（如 load()），若不等待清理完成，
      // 紧随其后的 GET 会命中 Redis 里的旧缓存，造成「新增/删除后树不刷新，只有强制刷新才恢复」。
      await this.redis.delByPrefix('http-cache:');
      return next.handle();
    }

    const url = req.originalUrl || req.url;
    if (!url.startsWith('/api/')) return next.handle();

    const path = url.split('?')[0];
    const rule = WHITELIST.find((r) => r.re.test(path));
    if (!rule) {
      // 非白名单 GET：私有、需重新校验，避免用户相关数据进入共享缓存
      res.set('Cache-Control', 'private, no-cache');
      return next.handle();
    }

    const ttl = rule.ttl;
    // 重要：不能向浏览器/代理下发 max-age 缓存。写操作（增删改）后浏览器无法感知
    // 服务端缓存已失效，会继续命中自己的 HTTP 缓存，造成「删除了组织但树里仍显示、
    // 新增后看不到，只有强制刷新才恢复」。服务端 Redis 缓存（本拦截器）已承担共享
    // 缓存职责，浏览器一律 no-store，每次请求都回源（Redis 命中毫秒级返回）。
    res.set('Cache-Control', 'no-store');
    const key = 'http-cache:' + url;

    if (this.redis.isReady()) {
      try {
        const cached = await this.redis.get(key);
        if (cached !== null) {
          res.set('X-Cache', 'HIT');
          // RedisService.get 已 JSON.parse，cached 即控制器原始返回值对象
          return of(cached);
        }
      } catch {
        // 读取异常 → 忽略，走源
      }
    }

    return next.handle().pipe(
      tap((data) => {
        if (this.redis.isReady()) {
          // 写入控制器原始返回值；RedisService.set 会自动 JSON.stringify
          this.redis.set(key, data, ttl).catch(() => undefined);
        }
      }),
    );
  }
}
