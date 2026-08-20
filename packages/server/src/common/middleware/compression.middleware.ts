import {
  gzip,
  deflate,
  brotliCompress,
  constants,
  type ZlibOptions,
  type BrotliOptions,
} from 'node:zlib';
import type { Request, Response, NextFunction } from 'express';

/**
 * 零依赖 HTTP 响应压缩中间件（基于 Node 内置 zlib）。
 *
 * 作用：对 text/html、application/javascript、json、css、svg、font 等可压缩响应体
 * 做 brotli / gzip / deflate 压缩，显著降低经公网传输的静态资源与 API 体积。
 * 设计目标：在 2 核 2G 的小机型上也能低开销运行，且不引入任何第三方依赖。
 *
 * 行为：
 * - 优先 br（压缩率最高），其次 gzip / deflate；客户端不支持任何压缩则透传；
 * - 跳过 HEAD 请求、非 2xx 状态码、已带 Content-Encoding 的响应；
 * - 仅压缩「可压缩类型」，图片/视频/已压缩二进制直接透传；
 * - 设置 Vary: Accept-Encoding，并移除原 Content-Length（由压缩后重新计算）；
 * - 采用「缓冲整段响应 → 一次性压缩」策略（而非流式），对 gzip/brotli 都稳定可靠；
 * - 已压缩结果按 URL+编码 缓存在内存（有上限），静态资源（哈希命名、内容不变）
 *   二次请求直接命中缓存，省去重复压缩的 CPU 开销。
 */
const COMPRESSIBLE = /^(text\/|application\/(javascript|json|xml|ld\+json|wasm)|image\/svg\+xml|font\/)/;

interface CachedResponse {
  body: Buffer;
  contentType?: string;
  cacheControl?: string;
}

// 仅缓存 Vite 哈希资源；HTML/SPA 入口必须每次交给静态服务读取，避免构建后仍返回旧页面。
// key = originalUrl + '|' + encoding
const cache = new Map<string, CachedResponse>();
const MAX_CACHE = 300;

export function compressionMiddleware(req: Request, res: Response, next: NextFunction): void {
  // HEAD 没有响应体，无需压缩
  if (req.method === 'HEAD') return next();

  const accept = String(req.headers['accept-encoding'] || '');
  let encoding: 'br' | 'gzip' | 'deflate' | null = null;
  if (/\bbr\b/.test(accept)) encoding = 'br';
  else if (/\bgzip\b/.test(accept)) encoding = 'gzip';
  else if (/\bdeflate\b/.test(accept)) encoding = 'deflate';
  if (!encoding) return next();

  // /api/ 路径含用户身份相关数据，禁止缓存读写，避免跨用户数据泄露（仍执行运行时压缩）
  const isApi = req.originalUrl.startsWith('/api/');
  const isImmutableAsset = !isApi && req.originalUrl.includes('/assets/');
  const cacheKey = req.originalUrl + '|' + encoding;

  // 命中已压缩缓存：直接发送，零压缩开销
  const cached = isImmutableAsset ? cache.get(cacheKey) : undefined;
  if (cached) {
    res.setHeader('Content-Encoding', encoding);
    if (cached.contentType) res.setHeader('Content-Type', cached.contentType);
    if (cached.cacheControl) res.setHeader('Cache-Control', cached.cacheControl);
    res.removeHeader('Content-Length');
    res.setHeader('Vary', 'Accept-Encoding');
    res.end(cached.body);
    return;
  }

  const originalWrite = res.write.bind(res) as typeof res.write;
  const originalEnd = res.end.bind(res) as typeof res.end;
  const rawChunks: Buffer[] = [];
  let decided = false;
  let compress = false;

  const shouldCompress = (): boolean => {
    const status = res.statusCode;
    if (status !== 200 && status !== 201) return false;
    if (res.getHeader('Content-Encoding')) return false;
    const type = String(res.getHeader('Content-Type') || '');
    // 未声明类型时默认压缩（本系统响应均带 Content-Type）；显式声明不可压缩类型则跳过
    if (type && !COMPRESSIBLE.test(type)) return false;
    return true;
  };

  const collect = (chunk: any): void => {
    if (Buffer.isBuffer(chunk)) rawChunks.push(chunk);
    else if (typeof chunk === 'string') rawChunks.push(Buffer.from(chunk));
  };

  const finish = (): void => {
    const raw = Buffer.concat(rawChunks);
    if (raw.length === 0) {
      res.removeHeader('Content-Encoding');
      originalEnd(raw);
      return;
    }
    // 压缩结果会被内存缓存，CPU 只付一次，因此用最高压缩率换取最小体积：
    // brotli q11（显著优于 gzip）、gzip l9。
    const opts: ZlibOptions | BrotliOptions =
      encoding === 'br'
        ? { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }
        : { level: 9 };
    const fn = (
      encoding === 'br'
        ? brotliCompress
        : encoding === 'gzip'
          ? gzip
          : deflate
    ) as (buf: Buffer, options: ZlibOptions | BrotliOptions, cb: (err: Error | null, buf: Buffer) => void) => void;
    fn(raw, opts, (err, buf) => {
      if (err) {
        // 压缩失败兜底：回退发送原文
        res.removeHeader('Content-Encoding');
        originalEnd(raw);
        return;
      }
      if (isImmutableAsset) {
        if (cache.size >= MAX_CACHE) cache.clear();
        cache.set(cacheKey, {
          body: buf,
          contentType: String(res.getHeader('Content-Type') || '') || undefined,
          cacheControl: String(res.getHeader('Cache-Control') || '') || undefined,
        });
      }
      res.setHeader('Content-Encoding', encoding as string);
      res.removeHeader('Content-Length');
      res.setHeader('Vary', 'Accept-Encoding');
      originalEnd(buf);
    });
  };

  res.write = function (chunk: any, ...args: any[]): boolean {
    if (!decided) {
      decided = true;
      compress = shouldCompress();
    }
    if (compress) {
      collect(chunk);
      return true;
    }
    return (originalWrite as (c: any, ...a: any[]) => boolean)(chunk, ...args);
  } as typeof res.write;

  res.end = function (chunk?: any, ...args: any[]): Response {
    if (!decided) {
      decided = true;
      compress = shouldCompress();
    }
    if (compress) {
      if (chunk !== undefined && chunk !== null) collect(chunk);
      finish();
      return res;
    }
    return (originalEnd as (c?: any, ...a: any[]) => Response)(chunk, ...args);
  } as typeof res.end;

  next();
}
