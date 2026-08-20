import { Injectable, UnauthorizedException, ConflictException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { UserService } from '../user/user.service';
import { LoginDto } from '@ai-party-school/shared';
import { JwtPayload } from '../../common/guards/jwt-auth.guard';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly userService: UserService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (!user) throw new UnauthorizedException('用户名或密码错误');

    const ok = await bcrypt.compare(dto.password, user.password);
    if (!ok) throw new UnauthorizedException('用户名或密码错误');

    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role as any,
      orgId: user.orgId,
      ver: user.securityVersion,
    };

    const accessToken = await this.jwt.sign(payload);
    const refreshToken = await this.jwt.sign(
      { ...payload, type: 'refresh' },
      { expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '30d') },
    );

    const { password, ...rest } = user;
    return {
      accessToken,
      refreshToken,
      user: this.userService.mapEntity(rest as any),
      forceChangePassword: user.forceChangePassword,
    };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwt.verify<JwtPayload & { type?: string }>(refreshToken);
      // 仅允许 refresh 类型 token 调用，避免 accessToken 被当作 refreshToken 使用
      if (payload.type !== 'refresh') throw new UnauthorizedException('非 refresh token');
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) throw new UnauthorizedException();
      if (payload.ver !== user.securityVersion) {
        throw new UnauthorizedException('登录已过期，请重新登录');
      }
      const newPayload: JwtPayload = {
        sub: user.id,
        username: user.username,
        role: user.role as any,
        orgId: user.orgId,
        ver: user.securityVersion,
      };
      const accessToken = await this.jwt.sign(newPayload);
      return { accessToken };
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      throw new UnauthorizedException('refresh token 无效');
    }
  }

  async register(username: string, password: string, name: string, orgId: number) {
    const exists = await this.prisma.user.findUnique({ where: { username } });
    if (exists) throw new ConflictException('用户名已存在');
    const hashed = await bcrypt.hash(password, 12);
    const user = await this.prisma.user.create({
      data: { username, password: hashed, name, orgId, role: 'MEMBER' as any },
    });
    const { password: _, ...rest } = user;
    return this.userService.mapEntity(rest as any);
  }

  async changePassword(userId: number, oldPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const ok = await bcrypt.compare(oldPassword, user.password);
    if (!ok) throw new UnauthorizedException('原密码错误');
    const hashed = await bcrypt.hash(newPassword, 12);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: hashed,
        forceChangePassword: false,
        securityVersion: { increment: 1 },
      },
    });
    return { success: true, ...(await this.issueTokens(updated)) };
  }

  /** 首次登录/重置密码后强制设置新密码（无需原密码） */
  async setPassword(userId: number, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (!user.forceChangePassword) {
      throw new ForbiddenException('当前账户不需要强制设置密码，请使用修改密码功能');
    }
    const hashed = await bcrypt.hash(newPassword, 12);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: hashed,
        forceChangePassword: false,
        securityVersion: { increment: 1 },
      },
    });
    return { success: true, ...(await this.issueTokens(updated)) };
  }

  private async issueTokens(user: {
    id: number;
    username: string;
    role: string;
    orgId: number;
    securityVersion: number;
  }) {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role as any,
      orgId: user.orgId,
      ver: user.securityVersion,
    };
    const accessToken = await this.jwt.sign(payload);
    const refreshToken = await this.jwt.sign(
      { ...payload, type: 'refresh' },
      { expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '30d') },
    );
    return { accessToken, refreshToken };
  }
}
