import fs from 'fs';
import path from 'path';
import type { Request, Response, NextFunction } from 'express';

/**
 * 构建期预压缩「直发」中间件。
 *
 * 配合构建后脚本 scripts/precompress.cjs：该脚本为每个静态资源（js/css/html/svg/...）
 * 生成 .gz（gzip l9）与 .br（brotli q11）兄弟文件。本中间件在静态服务之前运行，
 * 若客户端声明支持且磁盘上存在对应预压缩文件，则直接以流方式发出该文件并结束响应。
 *
 * 收益（相比 compression.middleware 的运行时压缩）：
 *  - 零运行时 CPU：压缩在构建期完成一次，不再每次请求现压；
 *  - 重启不失效：不依赖进程内存中的压缩结果缓存；
 *  - 首字节更快：省去「缓冲 → 压缩」的等待。
 *
 * 安全边界：
 *  - 仅对「磁盘上真实存在」的静态资源生效（依扩展名 + existsSync 判定）；
 *  - SPA history 路由（如 /admin/dashboard）在磁盘上无对应文件，会 next() 交给 SPA fallback，
 *    不会被误判为静态资源而发错内容；
 *  - API / 上传路径显式跳过。
 *  - 客户端不支持任何压缩编码时，交给下面的 expressStatic 发原文（由 compression.middleware 兜底）。
 */
const MIME: Record<string, string> = {
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};
const COMPRESSIBLE_EXT = new Set(Object.keys(MIME));

function publicRoot(): string {
  return path.resolve(process.cwd(), 'public');
}

/** 将请求路径映射到 server/public 下的真实文件路径（admin 挂 /admin，mobile 挂根） */
function diskPathFor(url: string): string | null {
  let u: string;
  try {
    u = decodeURIComponent(url.split('?')[0]);
  } catch {
    return null;
  }
  if (u.includes('..')) return null;
  let disk: string;
  if (u.startsWith('/admin/')) {
    disk = path.join(publicRoot(), 'admin', u.slice('/admin/'.length));
  } else if (u.startsWith('/')) {
    disk = path.join(publicRoot(), 'mobile', u.slice(1));
  } else {
    return null;
  }
  // 目录（如请求 /admin/ 或 /）按 index.html 处理
  try {
    const st = fs.statSync(disk);
    if (st.isDirectory()) disk = path.join(disk, 'index.html');
  } catch {
    // 不存在则保持原样，后续 existsSync 会判否
  }
  return disk;
}

function pickEncoding(req: Request): 'br' | 'gzip' | null {
  const ae = String(req.headers['accept-encoding'] || '');
  if (/\bbr\b/.test(ae)) return 'br';
  if (/\bgzip\b/.test(ae)) return 'gzip';
  return null;
}

export function precompressMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();

  const url = req.url;
  // 仅处理静态资源与 SPA 入口；API / 上传绕过
  if (url.startsWith('/api') || url.startsWith('/uploads')) return next();

  const disk = diskPathFor(url);
  if (!disk) return next();
  if (!fs.existsSync(disk)) return next();
  let statDisk: fs.Stats;
  try {
    statDisk = fs.statSync(disk);
  } catch {
    return next();
  }
  if (!statDisk.isFile()) return next();

  const ext = path.extname(disk);
  if (!COMPRESSIBLE_EXT.has(ext)) return next();

  const encoding = pickEncoding(req);
  if (!encoding) return next(); // 客户端不支持压缩 → 交给 expressStatic 发原文

  const suffix = encoding === 'br' ? '.br' : '.gz';
  let file = disk + suffix;
  let enc: 'br' | 'gzip' = encoding;
  if (!fs.existsSync(file)) {
    // 偏好编码缺失时回退到另一种
    const altSuffix = encoding === 'br' ? '.gz' : '.br';
    if (!fs.existsSync(disk + altSuffix)) return next();
    file = disk + altSuffix;
    enc = encoding === 'br' ? 'gzip' : 'br';
  }

  let statFile: fs.Stats;
  try {
    statFile = fs.statSync(file);
  } catch {
    return next();
  }

  const isHashed = url.includes('/assets/');
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  res.setHeader('Content-Encoding', enc);
  res.setHeader('Vary', 'Accept-Encoding');
  res.setHeader('Cache-Control', isHashed ? 'public, max-age=31536000, immutable' : 'no-cache');
  res.setHeader('Content-Length', statFile.size);

  if (req.method === 'HEAD') {
    res.status(200).end();
    return;
  }
  fs.createReadStream(file).pipe(res);
}

export default precompressMiddleware;
