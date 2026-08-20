import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '@ai-party-school/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { getAuthCookie } from '../utils/cookie.util';

export interface JwtPayload {
  sub: number;
  username: string;
  role: Role;
  orgId: number;
  /** token 版本号：改密后自增，用于吊销旧 token */
  ver?: number;
  /** token 类型：refresh token 标记，避免 accessToken 被当作 refreshToken 使用 */
  type?: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('未登录');

    let payload: JwtPayload;
    try {
      payload = this.jwt.verify<JwtPayload>(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('登录已过期，请重新登录');
    }

    // 拒绝 refresh token 用作 accessToken 访问
    if (payload.type === 'refresh') {
      throw new UnauthorizedException('不能使用 refresh token 进行访问');
    }
    // 用户状态以数据库为准：用户删除、角色/组织/密码变更后旧 token 立即失效。
    const currentUser = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        username: true,
        role: true,
        orgId: true,
        forceChangePassword: true,
        securityVersion: true,
      },
    });
    if (!currentUser || payload.ver !== currentUser.securityVersion) {
      throw new UnauthorizedException('登录已过期，请重新登录');
    }

    if (currentUser.forceChangePassword && !this.isPasswordSetupRequest(request)) {
      throw new ForbiddenException('请先设置新密码');
    }

    const currentPayload: JwtPayload = {
      sub: currentUser.id,
      username: currentUser.username,
      role: currentUser.role as Role,
      orgId: currentUser.orgId,
      ver: currentUser.securityVersion,
    };
    (request as any).user = currentPayload;

    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredRoles && requiredRoles.length > 0) {
      const user = (request as any).user as JwtPayload;
      if (!requiredRoles.includes(user.role)) {
        throw new ForbiddenException('权限不足');
      }
    }

    return true;
  }

  private isPasswordSetupRequest(request: Request): boolean {
    const path = request.originalUrl.split('?')[0].replace(/\/+$/, '');
    return path.endsWith('/auth/me') || path.endsWith('/auth/set-password');
  }

  private extractToken(request: Request): string | null {
    // P0-7：优先从 HttpOnly Cookie 读取（前端不再落地 token 到 localStorage）
    // 按客户端作用域取名，管理端与学习端在同一浏览器互不覆盖
    const cookieToken = getAuthCookie(request, 'access');
    if (cookieToken) return cookieToken;
    // 兼容非浏览器客户端：Authorization: Bearer <token>
    const auth = request.headers.authorization;
    if (!auth) return null;
    const [type, token] = auth.split(' ');
    return type === 'Bearer' && token ? token : null;
  }
}
