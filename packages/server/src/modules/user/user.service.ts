import { Injectable, BadRequestException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatService } from '../chat/chat.service';
import {
  CreateUserDto,
  Role,
  UserEntity,
  Paginated,
} from '@ai-party-school/shared';
import type { ParsedUserImportRow, UserImportResultRow } from './user-import';

/** 操作者上下文：用于权限校验 */
export interface UserActor {
  id: number;
  role: Role;
  orgId: number;
}

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chat: ChatService,
  ) {}

  mapEntity(user: any): UserEntity {
    return {
      id: user.id,
      username: user.username,
      name: user.name,
      phone: user.phone,
      orgId: user.orgId,
      orgName: user.orgName ?? user.org?.name,
      role: user.role as Role,
      forceChangePassword: Boolean(user.forceChangePassword),
      createdAt: user.createdAt,
    };
  }

  /**
   * 查询用户列表
   * - ADMIN：可查全部，按传入 orgId 过滤
   * - SECRETARY：强制按本人 orgId 过滤（忽略传入 orgId）
   */
  async findAll(
    params: {
      page?: number;
      pageSize?: number;
      name?: string;
      orgId?: number;
      role?: Role;
    },
    actor?: UserActor,
  ): Promise<Paginated<UserEntity>> {
    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 20, 100);
    const where: Prisma.UserWhereInput = {};
    if (params.name) where.name = { contains: params.name };
    if (params.role) where.role = params.role as any;

    if (actor && actor.role === Role.SECRETARY) {
      // 书记只能看本支部，且只能查党员（不能查 ADMIN/SECRETARY）
      where.orgId = actor.orgId;
      where.role = 'MEMBER';
    } else {
      if (params.orgId) where.orgId = params.orgId;
      if (params.role) where.role = params.role as any;
    }

    const [list, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: { org: true },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      list: list.map((u) => this.mapEntity({ ...u, orgName: u.org?.name })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * 创建用户
   * - ADMIN：可任意创建
   * - SECRETARY：仅可在本支部创建 MEMBER，orgId 强制为本人 orgId，role 强制为 MEMBER
   */
  async create(dto: CreateUserDto, actor?: UserActor): Promise<UserEntity & { initialPassword?: string }> {
    const exists = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (exists) throw new BadRequestException('用户名已存在');

    let orgId = dto.orgId;
    let role = dto.role;

    if (actor && actor.role === Role.SECRETARY) {
      orgId = actor.orgId;
      role = Role.MEMBER;
    }

    // 未提供密码则随机生成初始密码，并标记首次登录强制改密
    let passwordHash: string;
    let initialPassword: string | undefined;
    const forceChangePassword = true;
    if (dto.password) {
      passwordHash = await bcrypt.hash(dto.password, 12);
    } else {
      initialPassword = generateRandomPassword();
      passwordHash = await bcrypt.hash(initialPassword, 12);
    }

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        password: passwordHash,
        name: dto.name,
        phone: dto.phone,
        orgId,
        role: role as any,
        forceChangePassword,
      },
      include: { org: true },
    });
    // 新建用户后同步群聊归属（支部群 / 管理群）
    await this.chat.syncUserGroups(user.id);
    const entity = this.mapEntity({ ...user, orgName: user.org?.name });
    return initialPassword ? { ...entity, initialPassword } : entity;
  }

  /**
   * 更新用户
   * - ADMIN：可改任意用户
   * - SECRETARY：仅可改本支部 MEMBER；不能改 orgId、不能改 role（避免把自己支部成员提升为 ADMIN/SECRETARY）
   */
  async update(id: number, dto: Partial<CreateUserDto>, actor?: UserActor): Promise<UserEntity> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('用户不存在');

    if (actor && actor.role === Role.SECRETARY) {
      // 不能改上级/同级管理员
      if (target.orgId !== actor.orgId) {
        throw new ForbiddenException('无权修改其他支部的用户');
      }
      if (target.role !== Role.MEMBER) {
        throw new ForbiddenException('无权修改非本支部党员（管理员/书记）');
      }
    }

    const data: Prisma.UserUpdateInput = {};
    let invalidateSessions = false;
    if (dto.name) data.name = dto.name;
    if (dto.phone !== undefined) data.phone = dto.phone;

    if (actor && actor.role === Role.ADMIN) {
      // 仅 ADMIN 可改 orgId / role
      if (dto.orgId && dto.orgId !== target.orgId) {
        data.org = { connect: { id: dto.orgId } };
        invalidateSessions = true;
      }
      if (dto.role && dto.role !== target.role) {
        data.role = dto.role as any;
        invalidateSessions = true;
      }
    }
    if (dto.password) {
      data.password = await bcrypt.hash(dto.password, 12);
      // 改密后使旧 token 失效，并强制下次登录改密
      data.forceChangePassword = true;
      invalidateSessions = true;
    }
    if (invalidateSessions) data.securityVersion = { increment: 1 };

    const user = await this.prisma.user.update({
      where: { id },
      data,
      include: { org: true },
    });
    // 改动 orgId 或 role 后同步群聊归属
    if (dto.orgId !== undefined || dto.role !== undefined) {
      await this.chat.syncUserGroups(user.id);
    }
    return this.mapEntity({ ...user, orgName: user.org?.name });
  }

  /**
   * 删除用户
   * - ADMIN：可删任意用户
   * - SECRETARY：仅可删本支部 MEMBER
   */
  async remove(id: number, actor?: UserActor): Promise<{ success: boolean }> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('用户不存在');

    if (actor && actor.role === Role.SECRETARY) {
      if (target.orgId !== actor.orgId) {
        throw new ForbiddenException('无权删除其他支部的用户');
      }
      if (target.role !== Role.MEMBER) {
        throw new ForbiddenException('无权删除非本支部党员（管理员/书记）');
      }
    }

    await this.prisma.user.delete({ where: { id } });
    return { success: true };
  }

  async listImportOrganizations(): Promise<Array<{ id: number; name: string }>> {
    return this.prisma.org.findMany({ select: { id: true, name: true }, orderBy: { id: 'asc' } });
  }

  async batchCreate(users: ParsedUserImportRow[]): Promise<UserImportResultRow[]> {
    // 用户数据在同一事务中创建；逐行校验并返回明确结果。
    const transactionResult = await this.prisma.$transaction(async (tx) => {
      const results: UserImportResultRow[] = [];
      const createdIds: number[] = [];
      const validOrgIds = new Set((await tx.org.findMany({
        where: { id: { in: Array.from(new Set(users.map((user) => user.orgId))) } },
        select: { id: true },
      })).map((org) => org.id));
      const usernames = new Set<string>();
      for (const u of users) {
        try {
          if (usernames.has(u.username)) {
            results.push({ rowNumber: u.rowNumber, success: false, username: u.username, error: '文件内用户名重复' });
            continue;
          }
          usernames.add(u.username);
          if (!validOrgIds.has(u.orgId)) {
            results.push({ rowNumber: u.rowNumber, success: false, username: u.username, error: '所属支部不存在' });
            continue;
          }
          const exists = await tx.user.findUnique({ where: { username: u.username } });
          if (exists) {
            results.push({ rowNumber: u.rowNumber, success: false, username: u.username, error: '用户名已存在' });
            continue;
          }
          const pwd = u.password ?? generateRandomPassword();
          const hashed = await bcrypt.hash(pwd, 12);
          const created = await tx.user.create({
            data: {
              username: u.username,
              password: hashed,
              name: u.name,
              phone: u.phone,
              orgId: u.orgId,
              role: (u.role ?? Role.MEMBER) as any,
              forceChangePassword: true,
            },
          });
          createdIds.push(created.id);
          results.push({ rowNumber: u.rowNumber, success: true, username: u.username, initialPassword: pwd });
        } catch {
          // 不向客户端暴露内部错误细节
          results.push({ rowNumber: u.rowNumber, success: false, username: u.username, error: '创建失败' });
        }
      }
      return { results, createdIds };
    });
    for (const userId of transactionResult.createdIds) {
      try {
        await this.chat.syncUserGroups(userId);
      } catch (error: any) {
        this.logger.warn(`导入用户 ${userId} 后同步群聊失败：${error?.message ?? '未知错误'}`);
      }
    }
    return transactionResult.results;
  }
}

/** 生成 12 位随机密码（易读字符集，去除易混淆字符） */
function generateRandomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let pwd = '';
  for (let i = 0; i < 12; i++) pwd += chars[randomInt(chars.length)];
  return pwd;
}
