import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded, static as expressStatic } from 'express';
import helmet from 'helmet';
import { join, resolve } from 'path';
import { existsSync } from 'fs';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpCacheInterceptor } from './common/interceptors/http-cache.interceptor';
import { compressionMiddleware } from './common/middleware/compression.middleware';
import { precompressMiddleware } from './common/middleware/precompress.middleware';
import { RedisService } from './redis/redis.service';

/**
 * 静态资源缓存策略：
 * - 带哈希的文件名（Vite 默认输出到 /assets/*，如 xxx.[hash].js/.css）内容不可变，
 *   缓存 1 年且标记为 immutable，浏览器再次访问/切换页面基本不再下载；
 * - index.html 不带哈希，需每次向服务器校验（no-cache），以便发布新版本即时生效。
 */
function setStaticHeaders(res: import('express').Response, filepath: string): void {
  if (/\.html?$/i.test(filepath)) {
    res.setHeader('Cache-Control', 'no-cache');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const port = config.get<number>('SERVER_PORT', 3000);
  const host = config.get<string>('SERVER_HOST', '0.0.0.0');
  const prefix = config.get<string>('SERVER_PREFIX', '/api');

  // 安全 HTTP 头
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
      },
    },
  }));

  // CORS：生产环境必须显式配置白名单；未配置时仅允许同源请求。
  const corsOrigins = config.get<string>('CORS_ORIGINS');
  const isProduction = config.get<string>('NODE_ENV') === 'production';
  app.enableCors(
    corsOrigins
      ? { origin: corsOrigins.split(',').map((s) => s.trim()), credentials: true }
      : { origin: isProduction ? false : true, credentials: !isProduction },
  );

  // 优雅关闭（PM2 SIGINT 时执行 onModuleDestroy）
  app.enableShutdownHooks();

  app.setGlobalPrefix(prefix);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
  // 服务端只读接口缓存（白名单 + Redis）：注册在 TransformInterceptor 之后即最内层，
  // 拦截器拿到的是控制器原始返回值，命中缓存时直接返回，外层信封保持一致。
  app.useGlobalInterceptors(new HttpCacheInterceptor(app.get(RedisService)));

  // 静态资源构建期预压缩直发：零运行时 CPU、重启不失效。
  // 必须在 compressionMiddleware 之前注册——命中预压缩文件时直接结束响应，
  // 避免运行时压缩中间件对已压缩内容二次压缩。
  app.use(precompressMiddleware);

  // 响应压缩（gzip/brotli）：显著降低经公网传输的静态资源与 API 体积
  // （静态资源若已有预压缩兄弟文件，precompress 已直发，此处仅兜底 API / SPA HTML）
  app.use(compressionMiddleware);

  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  // 静态文件服务 - 上传的文件
  const uploadDir = config.get<string>('UPLOAD_DIR', 'uploads');
  app.useStaticAssets(resolve(process.cwd(), uploadDir), {
    prefix: '/uploads/',
    setHeaders: (res, filepath) => {
      // 防止 MIME 嗅探攻击
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // 对可执行脚本类文件强制下载，避免被当作 HTML 渲染触发存储型 XSS
      if (/\.(html?|svg|js)$/i.test(filepath)) {
        res.setHeader('Content-Disposition', 'attachment');
        res.setHeader('Content-Type', 'text/plain');
      }
    },
  });

  // 生产环境：托管 admin / mobile 前端构建产物
  // 目录结构（部署时由构建脚本生成）：
  //   packages/server/dist/main.js
  //   packages/server/public/admin/    ← admin vite build 输出
  //   packages/server/public/mobile/   ← mobile vite build 输出
  const publicDir = resolve(process.cwd(), 'public');
  const adminDir = join(publicDir, 'admin');
  const mobileDir = join(publicDir, 'mobile');

  if (existsSync(adminDir)) {
    app.use('/admin', expressStatic(adminDir, { maxAge: '1y', setHeaders: setStaticHeaders }));
    // SPA history fallback
    const adminIndex = join(adminDir, 'index.html');
    if (existsSync(adminIndex)) {
      app.use((req, res, next) => {
        if (req.url.startsWith('/admin') && !req.url.startsWith('/api') && !req.url.startsWith('/uploads')) {
          if (!req.url.includes('.')) {
            res.setHeader('Cache-Control', 'no-cache');
            res.sendFile(adminIndex);
            return;
          }
        }
        next();
      });
    }
    Logger.log(`🖥️  Admin panel: http://localhost:${port}/admin/`, 'Bootstrap');
  }

  if (existsSync(mobileDir)) {
    app.use('/', expressStatic(mobileDir, { maxAge: '1y', setHeaders: setStaticHeaders }));
    // SPA history fallback（mobile 为根路径）
    const mobileIndex = join(mobileDir, 'index.html');
    if (existsSync(mobileIndex)) {
      app.use((req, res, next) => {
        if (
          !req.url.startsWith('/api') &&
          !req.url.startsWith('/uploads') &&
          !req.url.startsWith('/admin') &&
          !req.url.includes('.')
        ) {
          res.setHeader('Cache-Control', 'no-cache');
          res.sendFile(mobileIndex);
          return;
        }
        next();
      });
    }
    Logger.log(`📱 Mobile platform: http://localhost:${port}/`, 'Bootstrap');
  }

  app.set('trust proxy', 1);
  await app.listen(port, host);
  Logger.log(`🚀 Server running at http://${host}:${port}${prefix}`, 'Bootstrap');
  Logger.log(`📁 Static files served at http://${host}:${port}/uploads/`, 'Bootstrap');
}

bootstrap();
