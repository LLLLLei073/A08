import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

function createService(user: any) {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
      update: vi.fn().mockResolvedValue({ ...user, forceChangePassword: false, securityVersion: 4 }),
    },
  };
  const jwt = { sign: vi.fn().mockResolvedValueOnce('access').mockResolvedValueOnce('refresh') };
  const service = new AuthService(
    prisma as any,
    jwt as any,
    { get: vi.fn((_key: string, fallback: string) => fallback) } as any,
    { mapEntity: vi.fn((value: any) => value) } as any,
  );
  return { service, prisma, jwt };
}

describe('AuthService 强制改密', () => {
  it('普通用户不能通过 set-password 绕过旧密码校验', async () => {
    const { service } = createService({
      id: 1,
      username: 'member',
      password: 'hash',
      role: 'MEMBER',
      orgId: 2,
      forceChangePassword: false,
      securityVersion: 3,
    });
    await expect(service.setPassword(1, 'NewPassword1!')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('强制改密完成后递增持久版本并签发替换 Cookie 所需令牌', async () => {
    const { service, prisma } = createService({
      id: 1,
      username: 'member',
      password: 'hash',
      role: 'MEMBER',
      orgId: 2,
      forceChangePassword: true,
      securityVersion: 3,
    });
    const result = await service.setPassword(1, 'NewPassword1!');
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ securityVersion: { increment: 1 } }),
    }));
    expect(result).toEqual({ success: true, accessToken: 'access', refreshToken: 'refresh' });
  });

  it('刷新令牌版本落后于数据库时拒绝刷新', async () => {
    const { service } = createService({
      id: 1,
      username: 'member',
      role: 'MEMBER',
      orgId: 2,
      securityVersion: 4,
    });
    (service as any).jwt.verify = vi.fn().mockReturnValue({ sub: 1, type: 'refresh', ver: 3 });
    await expect(service.refresh('old-refresh')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
