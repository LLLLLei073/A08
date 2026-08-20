import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ContentEntity, CreateContentDto, LearningRecordDto, Paginated, Role } from '@ai-party-school/shared';

@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) { }

  private map(c: any): ContentEntity {
    let tags: string[] = [];
    try {
      tags = c.tags ? (typeof c.tags === 'string' ? JSON.parse(c.tags) : c.tags) : [];
    } catch {
      tags = [];
    }
    return {
      id: c.id,
      title: c.title,
      type: c.type,
      body: c.body,
      mediaUrl: c.mediaUrl,
      cover: c.cover,
      category: c.category,
      tags,
      isPublic: c.isPublic,
      duration: c.duration,
      createdAt: c.createdAt,
    };
  }

  async findAll(params: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    category?: string;
    type?: string;
    isPublic?: boolean;
  }): Promise<Paginated<ContentEntity>> {
    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 20, 100);
    const where: Prisma.ContentWhereInput = {};
    if (params.keyword) where.title = { contains: params.keyword };
    if (params.category) where.category = params.category;
    if (params.type) where.type = params.type as any;
    if (params.isPublic !== undefined) where.isPublic = params.isPublic;

    const [list, total] = await Promise.all([
      this.prisma.content.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: 'desc' },
      }),
      this.prisma.content.count({ where }),
    ]);
    return { list: list.map(this.map), total, page, pageSize };
  }

  // 移动端可见内容：公共 + 所在支部任务指定
  async findVisible(userId: number, params: { page?: number; pageSize?: number; keyword?: string; category?: string }) {
    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 20, 100);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');

    const taskContents = await this.prisma.learningTaskContent.findMany({
      where: { task: { orgId: user.orgId } },
      select: { contentId: true },
    });
    const ids = taskContents.map((t) => t.contentId);

    const where: Prisma.ContentWhereInput = {
      OR: [{ isPublic: true }, { id: { in: ids } }],
    };
    if (params.keyword) where.title = { contains: params.keyword };
    if (params.category) where.category = params.category;

    const [list, total] = await Promise.all([
      this.prisma.content.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: 'desc' },
      }),
      this.prisma.content.count({ where }),
    ]);
    return { list: list.map(this.map), total, page, pageSize };
  }

  async findOne(id: number, actor?: { id: number; role: Role }): Promise<ContentEntity> {
    const c = await this.prisma.content.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('内容不存在');
    // 非管理员只能查看公开内容或所在支部任务指定的内容
    if (actor && actor.role !== Role.ADMIN && actor.role !== Role.SECRETARY) {
      if (!c.isPublic) {
        const user = await this.prisma.user.findUnique({ where: { id: actor.id } });
        const inTask = user
          ? await this.prisma.learningTaskContent.findFirst({
            where: { contentId: id, task: { orgId: user.orgId } },
          })
          : null;
        if (!inTask) throw new NotFoundException('内容不存在');
      }
    }
    return this.map(c);
  }

  async create(dto: CreateContentDto): Promise<ContentEntity> {
    this.validateMediaUrls(dto.mediaUrl, dto.cover);
    const c = await this.prisma.content.create({
      data: {
        title: dto.title,
        type: dto.type as any,
        body: dto.body,
        mediaUrl: dto.mediaUrl,
        cover: dto.cover,
        category: dto.category,
        tags: JSON.stringify(dto.tags ?? []),
        isPublic: dto.isPublic ?? false,
        duration: dto.duration,
      },
    });
    return this.map(c);
  }

  async update(id: number, dto: Partial<CreateContentDto>): Promise<ContentEntity> {
    const exists = await this.prisma.content.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('内容不存在');
    this.validateMediaUrls(dto.mediaUrl, dto.cover);
    const c = await this.prisma.content.update({
      where: { id },
      data: {
        title: dto.title,
        body: dto.body,
        mediaUrl: dto.mediaUrl,
        cover: dto.cover,
        category: dto.category,
        tags: dto.tags !== undefined ? JSON.stringify(dto.tags) : undefined,
        isPublic: dto.isPublic,
        duration: dto.duration,
      },
    });
    return this.map(c);
  }

  async remove(id: number) {
    await this.prisma.content.delete({ where: { id } });
    return { success: true };
  }

  /** 校验 mediaUrl/cover 必须以 http(s):// 或 / 开头，防 javascript: 等恶意协议 */
  private validateMediaUrls(...urls: (string | undefined | null)[]) {
    for (const u of urls) {
      if (u && !/^(https?:\/\/|\/)/i.test(u)) {
        throw new BadRequestException('mediaUrl/cover 必须以 http(s):// 或 / 开头');
      }
    }
  }

  async recordLearning(userId: number, contentId: number, dto: LearningRecordDto, role?: Role) {
    // 防伪造：先校验内容对当前用户可见（存在且公开，或在本支部任务中），
    // 避免对私有/不存在的内容伪造学习记录
    const content = await this.prisma.content.findUnique({ where: { id: contentId } });
    if (!content) throw new NotFoundException('内容不存在');
    if (role !== Role.ADMIN && role !== Role.SECRETARY && !content.isPublic) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      const inTask = user
        ? await this.prisma.learningTaskContent.findFirst({
          where: { contentId, task: { orgId: user.orgId } },
        })
        : null;
      if (!inTask) throw new NotFoundException('内容不存在');
    }

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const existing = await tx.learningRecord.findUnique({
        where: { userId_contentId: { userId, contentId } },
      });

      // 客户端上报累计值，但每次最多接受自上次心跳以来的真实时间（并限制单次 15 秒）。
      // 首次心跳最多计 10 秒，阻止一次请求直接写入数小时学习时长。
      const baseDuration = existing?.duration ?? 0;
      const reportedDuration = Math.max(0, Math.floor(dto.duration));
      const elapsedSeconds = existing
        ? Math.max(0, Math.floor((now.getTime() - existing.updatedAt.getTime()) / 1000))
        : 8;
      const allowedIncrement = existing ? Math.min(elapsedSeconds, 15) : 10;
      const acceptedIncrement = Math.min(
        Math.max(0, reportedDuration - baseDuration),
        allowedIncrement,
      );
      const duration = baseDuration + acceptedIncrement;

      const requiredSeconds = this.requiredLearningSeconds(content);
      const reportedProgress = Math.min(Math.max(Math.floor(dto.progress), 0), 100);
      const maxTrustedProgress = requiredSeconds
        ? Math.min(100, Math.floor((duration / requiredSeconds) * 100))
        : 99;
      const progress = Math.max(
        existing?.progress ?? 0,
        Math.min(reportedProgress, maxTrustedProgress),
      );
      const completed = Boolean(existing?.completed) || Boolean(requiredSeconds && duration >= requiredSeconds && progress >= 100);

      const record = existing
        ? await tx.learningRecord.update({
          where: { id: existing.id },
          data: { duration, progress, completed },
        })
        : await tx.learningRecord.create({
          data: { userId, contentId, duration, progress, completed },
        });

      if (acceptedIncrement > 0) {
        // 以服务器本地日历日生成 UTC 零点，避免 toISOString 后日期退回前一天。
        const day = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
        await tx.learningDailyStat.upsert({
          where: { userId_contentId_day: { userId, contentId, day } },
          create: { userId, contentId, day, duration: acceptedIncrement },
          update: { duration: { increment: acceptedIncrement } },
        });
      }
      return record;
    });
  }

  private requiredLearningSeconds(content: { type: string; body: string | null; duration: number | null }): number | null {
    if (content.type === 'VIDEO') {
      return content.duration && content.duration > 0 ? content.duration : null;
    }
    const plainLength = (content.body ?? '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`[^`]*`/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/[#>*_~`\-+|=]/g, ' ')
      .replace(/\s/g, '')
      .length;
    return Math.max(20, Math.ceil(plainLength / 5));
  }

  /** 查询当前用户对某内容的学习记录（无则返回 null） */
  async getMyRecord(userId: number, contentId: number) {
    const rec = await this.prisma.learningRecord.findUnique({
      where: { userId_contentId: { userId, contentId } },
    });
    if (!rec) return null;
    return {
      progress: rec.progress,
      duration: rec.duration,
      completed: rec.completed,
    };
  }

  async getCategories(): Promise<string[]> {
    const rows = await this.prisma.content.findMany({
      select: { category: true },
      distinct: ['category'],
    });
    return rows.map((r) => r.category);
  }
}
