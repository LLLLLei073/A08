import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTaskDto, Role } from '@ai-party-school/shared';

export interface TaskActor {
  id: number;
  role: Role;
  orgId: number;
}

@Injectable()
export class TaskService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 查询任务列表
   * - ADMIN：可查全部，按传入 orgId 过滤
   * - SECRETARY：强制按本人 orgId 过滤
   */
  async findAll(params: { page?: number; pageSize?: number; orgId?: number }, actor?: TaskActor) {
    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 20, 100);
    const where: any = {};
    if (actor && actor.role === Role.SECRETARY) {
      where.orgId = actor.orgId;
    } else if (params.orgId) {
      where.orgId = params.orgId;
    }
    const [list, total] = await Promise.all([
      this.prisma.learningTask.findMany({
        where,
        include: { org: true, contents: { include: { content: true } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: 'desc' },
      }),
      this.prisma.learningTask.count({ where }),
    ]);
    return {
      list: list.map((t) => ({
        id: t.id,
        title: t.title,
        orgId: t.orgId,
        orgName: t.org?.name,
        deadline: t.deadline,
        participantUserIds: parseIds(t.participantUserIds),
        createdAt: t.createdAt,
        contents: t.contents.map((c) => ({
          contentId: c.contentId,
          title: c.content.title,
          type: c.content.type,
          category: c.content.category,
        })),
      })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * 我的任务：按参与者筛选
   * - participantUserIds 为空数组 → 支部全部成员可见
   * - 否则只对包含在列表中的用户可见
   */
  async findMyTasks(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');

    const tasks = await this.prisma.learningTask.findMany({
      where: { orgId: user.orgId },
      include: { contents: { include: { content: true } } },
      orderBy: { id: 'desc' },
    });

    // 过滤：仅返回当前用户可见的任务
    const visible = tasks.filter((t) => {
      const ids = parseIds(t.participantUserIds);
      return ids.length === 0 || ids.includes(userId);
    });

    const records = await this.prisma.learningRecord.findMany({
      where: { userId },
      select: { contentId: true, progress: true, completed: true, duration: true },
    });
    const recordMap = new Map(records.map((r) => [r.contentId, r]));

    return visible.map((t) => {
      const items = t.contents.map((c) => {
        const rec = recordMap.get(c.contentId);
        return {
          contentId: c.contentId,
          title: c.content.title,
          type: c.content.type,
          category: c.content.category,
          progress: rec?.progress ?? 0,
          duration: rec?.duration ?? 0,
          completed: rec?.completed ?? false,
        };
      });
      const totalItems = items.length;
      const completedItems = items.filter((i) => i.completed).length;
      return {
        id: t.id,
        title: t.title,
        deadline: t.deadline,
        totalItems,
        completedItems,
        progress: totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0,
        contents: items,
      };
    });
  }

  /**
   * 创建任务
   * - ADMIN：可指定任意 orgId
   * - SECRETARY：orgId 强制为本人支部
   */
  async create(dto: CreateTaskDto, actor?: TaskActor) {
    let orgId = dto.orgId;
    if (actor && actor.role === Role.SECRETARY) {
      orgId = actor.orgId;
    }

    if (dto.contentIds && dto.contentIds.length > 0) {
      const count = await this.prisma.content.count({ where: { id: { in: dto.contentIds } } });
      if (count !== dto.contentIds.length) throw new BadRequestException('部分内容不存在');
    }

    const task = await this.prisma.learningTask.create({
      data: {
        orgId,
        title: dto.title,
        deadline: new Date(dto.deadline),
        participantUserIds: JSON.stringify(dto.participantUserIds ?? []),
        contents: {
          create: dto.contentIds.map((id) => ({ contentId: id })),
        },
      },
      include: { org: true, contents: { include: { content: true } } },
    });
    return task;
  }

  async update(id: number, dto: Partial<CreateTaskDto>, actor?: TaskActor) {
    const existing = await this.prisma.learningTask.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('任务不存在');
    if (actor && actor.role === Role.SECRETARY && existing.orgId !== actor.orgId) {
      throw new ForbiddenException('无权修改其他支部的任务');
    }

    const data: any = {};
    if (dto.title) data.title = dto.title;
    // SECRETARY 不允许改 orgId
    if (dto.orgId && actor?.role === Role.ADMIN) data.orgId = dto.orgId;
    if (dto.deadline) data.deadline = new Date(dto.deadline);
    if (dto.participantUserIds !== undefined) {
      data.participantUserIds = JSON.stringify(dto.participantUserIds);
    }
    if (dto.contentIds) {
      data.contents = {
        deleteMany: {},
        create: dto.contentIds.map((cid) => ({ contentId: cid })),
      };
    }
    return this.prisma.learningTask.update({ where: { id }, data });
  }

  async remove(id: number, actor?: TaskActor) {
    const existing = await this.prisma.learningTask.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('任务不存在');
    if (actor && actor.role === Role.SECRETARY && existing.orgId !== actor.orgId) {
      throw new ForbiddenException('无权删除其他支部的任务');
    }
    await this.prisma.learningTask.delete({ where: { id } });
    return { success: true };
  }
}

function parseIds(raw: any): number[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
