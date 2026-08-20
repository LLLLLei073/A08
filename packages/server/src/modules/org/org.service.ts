import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrgDto, OrgNode, OrgStats } from '@ai-party-school/shared';
import { StatisticsService } from '../statistics/statistics.service';
import { ChatService } from '../chat/chat.service';

@Injectable()
export class OrgService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly statistics: StatisticsService,
    private readonly chat: ChatService,
  ) {}

  async getTree(): Promise<OrgNode[]> {
    const orgs = await this.prisma.org.findMany({
      orderBy: { id: 'asc' },
    });
    const userCounts = await this.prisma.org.findMany({
      select: { id: true, _count: { select: { users: true } } },
    });
    const countMap = new Map<number, number>();
    userCounts.forEach((u) => countMap.set(u.id, u._count.users));

    const map = new Map<number, OrgNode>();
    orgs.forEach((o) => {
      map.set(o.id, {
        id: o.id,
        name: o.name,
        parentId: o.parentId,
        level: o.level,
        createdAt: o.createdAt.toISOString(),
        children: [],
        userCount: countMap.get(o.id) ?? 0,
      });
    });

    const roots: OrgNode[] = [];
    map.forEach((node) => {
      if (node.parentId && map.has(node.parentId)) {
        map.get(node.parentId)!.children!.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  }

  async create(dto: CreateOrgDto): Promise<OrgNode> {
    if (dto.parentId) {
      const parent = await this.prisma.org.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new BadRequestException('父组织不存在');
    }
    const org = await this.prisma.org.create({
      data: { name: dto.name, parentId: dto.parentId ?? null, level: dto.level },
    });
    // 新建支部后建支部群
    await this.chat.ensureOrgGroup(org.id);
    return {
      id: org.id,
      name: org.name,
      parentId: org.parentId,
      level: org.level,
      createdAt: org.createdAt.toISOString(),
    };
  }

  async update(id: number, dto: Partial<CreateOrgDto>): Promise<OrgNode> {
    const exists = await this.prisma.org.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('组织不存在');
    if (dto.parentId) {
      if (dto.parentId === id) throw new BadRequestException('不能将自身设为父级');
      let currentParentId = dto.parentId;
      while (currentParentId) {
        if (currentParentId === id) throw new BadRequestException('不能形成循环引用');
        const parent = await this.prisma.org.findUnique({
          where: { id: currentParentId },
          select: { parentId: true },
        });
        if (!parent) break;
        currentParentId = parent.parentId ?? undefined;
      }
    }
    const org = await this.prisma.org.update({
      where: { id },
      data: { name: dto.name, parentId: dto.parentId, level: dto.level },
    });
    // 改名后同步支部群名
    if (dto.name) await this.chat.ensureOrgGroup(org.id);
    return {
      id: org.id,
      name: org.name,
      parentId: org.parentId,
      level: org.level,
      createdAt: org.createdAt.toISOString(),
    };
  }

  async remove(id: number): Promise<{ success: boolean }> {
    const hasChildren = await this.prisma.org.findFirst({ where: { parentId: id } });
    if (hasChildren) throw new BadRequestException('请先删除子组织');
    const hasUsers = await this.prisma.user.findFirst({ where: { orgId: id } });
    if (hasUsers) throw new BadRequestException('该组织下仍有党员，无法删除');
    // LearningTask / Quiz 引用 Org 未配置级联删除，若直接 delete 会触发外键约束 500；
    // 先给出明确提示，避免用户看到无法理解的原始 Prisma 报错。
    const hasTasks = await this.prisma.learningTask.findFirst({ where: { orgId: id } });
    if (hasTasks) throw new BadRequestException('该组织下仍有学习任务，无法删除');
    const hasQuizzes = await this.prisma.quiz.findFirst({ where: { orgId: id } });
    if (hasQuizzes) throw new BadRequestException('该组织下仍有测验/考试，无法删除');
    await this.prisma.org.delete({ where: { id } });
    return { success: true };
  }

  async getStats(orgId: number): Promise<OrgStats> {
    return this.statistics.getOrgStats(orgId);
  }
}
