import { Request, Response } from 'express';

/** 从请求头读取指定 cookie（不依赖 cookie-parser 中间件，避免额外依赖） */
export function getCookie(req: Request, name: string): string | null {
  const raw = req.headers?.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    if (k === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

/**
 * 是否应通过 HTTPS 传输 Cookie：
 * - 生产环境真实 HTTPS（req.secure）或经反向代理转发（x-forwarded-proto: https）→ secure
 * - 本地 http 调试 → 不 secure，否则浏览器拒绝写入 Cookie 导致登录失效
 * 不应仅依赖 NODE_ENV，否则本地 http 下 Secure Cookie 无法写入。
 */
function isSecureReq(req?: Request): boolean {
  if (!req) return process.env.NODE_ENV === 'production';
  const proto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim();
  return req.secure === true || proto === 'https';
}

function durationToMs(value: string | undefined, fallbackMs: number): number {
  const match = String(value ?? '').trim().match(/^(\d+)(ms|s|m|h|d)$/i);
  if (!match) return fallbackMs;
  const factors: Record<string, number> = {
    ms: 1,
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return Number(match[1]) * factors[match[2].toLowerCase()];
}

const accessMaxAge = () => durationToMs(process.env.JWT_EXPIRES_IN, 15 * 60 * 1000);
const refreshMaxAge = () => durationToMs(process.env.JWT_REFRESH_EXPIRES_IN, 30 * 24 * 3600 * 1000);

/** 客户端类型：管理端（PC 后台）与学习端（移动 H5）同源部署，会话必须隔离 */
export type ClientScope = 'admin' | 'mobile';

/**
 * 判定请求来自哪个前端。
 * 管理端挂在 /admin/，学习端挂在 /，两者同源同端口，若共用一套 Cookie 名，
 * 在同一浏览器里登录任意一端都会覆盖另一端的会话（表现为管理员被判「权限不足」）。
 * 优先取前端显式声明的 X-Client 头；回退按 Referer 路径判断，兼容老客户端。
 */
export function getClientScope(req?: Request): ClientScope {
  const header = String(req?.headers?.['x-client'] ?? '').trim().toLowerCase();
  if (header === 'admin') return 'admin';
  if (header === 'mobile') return 'mobile';
  const referer = String(req?.headers?.referer ?? '');
  if (referer) {
    try {
      if (new URL(referer).pathname.startsWith('/admin')) return 'admin';
    } catch {
      /* Referer 非法时忽略，按默认作用域处理 */
    }
  }
  return 'mobile';
}

/** 按客户端作用域取 Cookie 名（学习端沿用原名，避免存量会话失效） */
export function authCookieNames(req?: Request): { access: string; refresh: string } {
  return getClientScope(req) === 'admin'
    ? { access: 'admin_access_token', refresh: 'admin_refresh_token' }
    : { access: 'access_token', refresh: 'refresh_token' };
}

/** 读取当前作用域下的鉴权 Cookie；不跨作用域回退，否则会重新引入会话串号问题 */
export function getAuthCookie(req: Request, kind: 'access' | 'refresh'): string | null {
  const names = authCookieNames(req);
  return getCookie(req, kind === 'access' ? names.access : names.refresh);
}

function baseCookieOptions(req?: Request) {
  return {
    httpOnly: true,
    secure: isSecureReq(req),
    sameSite: 'strict' as const,
    path: '/',
  };
}

/** 登录时写入 access + refresh 两个 HttpOnly Cookie */
export function setAuthCookies(
  res: Response,
  req: Request,
  tokens: { accessToken: string; refreshToken: string },
): void {
  const names = authCookieNames(req);
  res.cookie(names.access, tokens.accessToken, {
    ...baseCookieOptions(req),
    maxAge: accessMaxAge(),
  });
  res.cookie(names.refresh, tokens.refreshToken, {
    ...baseCookieOptions(req),
    maxAge: refreshMaxAge(),
  });
}

/** 刷新后仅更新 access Cookie */
export function setAccessTokenCookie(res: Response, req: Request, accessToken: string): void {
  res.cookie(authCookieNames(req).access, accessToken, {
    ...baseCookieOptions(req),
    maxAge: accessMaxAge(),
  });
}

/** 登出时清除本作用域的两个 Cookie（需与写入时相同的 secure/path 才能正确清除） */
export function clearAuthCookies(res: Response, req: Request): void {
  const opts = { path: '/', secure: isSecureReq(req) } as const;
  const names = authCookieNames(req);
  res.clearCookie(names.access, opts);
  res.clearCookie(names.refresh, opts);
  // 注意：不跨作用域清除另一端的 Cookie，否则管理端登出会连带踢掉学习端会话
}
