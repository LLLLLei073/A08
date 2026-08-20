import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatService } from '../chat/chat.service';
import {
  Role,
  NotifyType,
  NotifyLevel,
  NotifyScope,
  NotificationEntity,
  SendNotificationDto,
} from '@ai-party-school/shared';

/** 操作者上下文 */
export interface NotifyActor {
  id: number;
  role: Role;
  orgId: number;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chat: ChatService,
  ) {}

  /** 发布通知：按 scope 扇出收件箱 */
  async send(actor: NotifyActor, dto: SendNotificationDto): Promise<NotificationEntity> {
    // 权限校验：全体通知仅 ADMIN 可发；书记只能面向本支部或本支部成员
    if (dto.scope === NotifyScope.ALL && actor.role !== Role.ADMIN) {
      throw new ForbiddenException('仅系统管理员可发布全体通知');
    }
    let targetUserIds: number[];
    let orgIds: number[] = [];
    let userIds: number[] = [];
    if (dto.scope === NotifyScope.ALL) {
      targetUserIds = (
        await this.prisma.user.findMany({ select: { id: true } })
      ).map((u) => u.id);
    } else if (dto.scope === NotifyScope.ORG) {
      if (!dto.orgIds || dto.orgIds.length === 0) {
        throw new BadRequestException('请选择接收通知的支部');
      }
      // 书记只能向本支部发
      if (actor.role !== Role.ADMIN) {
        const invalid = dto.orgIds.filter((oid) => oid !== actor.orgId);
        if (invalid.length > 0) throw new ForbiddenException('只能向本支部发送通知');
      }
      orgIds = dto.orgIds;
      targetUserIds = (
        await this.prisma.user.findMany({
          where: { orgId: { in: orgIds } },
          select: { id: true },
        })
      ).map((u) => u.id);
    } else {
      if (!dto.userIds || dto.userIds.length === 0) {
        throw new BadRequestException('请选择接收通知的人员');
      }
      if (actor.role !== Role.ADMIN) {
        const users = await this.prisma.user.findMany({
          where: { id: { in: dto.userIds } },
          select: { id: true, orgId: true, role: true },
        });
        const invalid = users.filter(
          (u) => u.orgId !== actor.orgId && u.role !== Role.ADMIN,
        );
        if (invalid.length > 0) throw new ForbiddenException('只能向本支部成员发送通知');
      }
      userIds = dto.userIds;
      targetUserIds = userIds;
    }

    if (targetUserIds.length === 0) throw new BadRequestException('接收人列表为空');

    // 选择同步推送的群：ALL 时推管理群；ORG 时推第一个支部群；USER 时按接收人所在支部推
    let syncGroupId: number | null = null;
    if (dto.syncToGroup) {
      if (dto.scope === NotifyScope.ALL) {
        const g = await this.prisma.chatGroup.findFirst({ where: { type: 'MANAGE' } });
        syncGroupId = g?.id ?? null;
      } else if (dto.scope === NotifyScope.ORG && orgIds.length > 0) {
        syncGroupId = await this.chat.getOrCreateOrgGroupId(orgIds[0]);
      }
    }

    const notification = await this.prisma.notification.create({
      data: {
        title: dto.title,
        content: dto.content,
        type: NotifyType.ANNOUNCE,
        level: dto.level ?? NotifyLevel.NORMAL,
        senderId: actor.id,
        scope: dto.scope,
        orgIds: JSON.stringify(orgIds),
        userIds: JSON.stringify(userIds),
        groupId: syncGroupId,
        recipients: {
          create: targetUserIds.map((uid) => ({ userId: uid })),
        },
      },
    });

    // 同步推送到群聊（NOTICE 类型消息，extra 带 notificationId）
    if (syncGroupId) {
      await this.chat.postSystemMessage(
        syncGroupId,
        `${dto.title}`,
        'NOTICE' as any,
        { notificationId: notification.id },
      );
    }

    return this.mapEntity(notification, { recipientCount: targetUserIds.length, readCount: 0 });
  }

  /** 我的收件箱 */
  async listMyNotifications(userId: number, page = 1, pageSize = 20) {
    const ps = Math.min(pageSize, 100);
    const [list, total] = await Promise.all([
      this.prisma.notificationRecipient.findMany({
        where: { userId },
        include: { notification: { include: { sender: { select: { name: true } } } } },
        orderBy: { notificationId: 'desc' },
        skip: (page - 1) * ps,
        take: ps,
      }),
      this.prisma.notificationRecipient.count({ where: { userId } }),
    ]);
    return {
      list: list.map((r) =>
        this.mapEntity(
          {
            ...r.notification,
            senderName: r.notification.sender?.name,
          },
          { isRead: r.isRead, readAt: r.readAt?.toISOString() ?? null },
        ),
      ),
      total,
      page,
      pageSize: ps,
    };
  }

  /** 我发送的通知（发送者视角） */
  async listSentNotifications(actor: NotifyActor, page = 1, pageSize = 20) {
    const ps = Math.min(pageSize, 100);
    const where: any = { senderId: actor.id };
    if (actor.role !== Role.ADMIN) {
      where.senderId = actor.id;
    }
    const [list, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        include: { sender: { select: { name: true } } },
        orderBy: { id: 'desc' },
        skip: (page - 1) * ps,
        take: ps,
      }),
      this.prisma.notification.count({ where }),
    ]);
    const ids = list.map((n) => n.id);
    const aggs = ids.length
      ? await this.prisma.notificationRecipient.groupBy({
          by: ['notificationId'],
          where: { notificationId: { in: ids } },
          _count: true,
        })
      : [];
    const readAggs = ids.length
      ? await this.prisma.notificationRecipient.groupBy({
          by: ['notificationId'],
          where: { notificationId: { in: ids }, isRead: true },
          _count: true,
        })
      : [];
    const countMap = new Map(aggs.map((a) => [a.notificationId, a._count]));
    const readMap = new Map(readAggs.map((a) => [a.notificationId, a._count]));
    return {
      list: list.map((n) =>
        this.mapEntity({ ...n, senderName: n.sender?.name }, {
          recipientCount: countMap.get(n.id) ?? 0,
          readCount: readMap.get(n.id) ?? 0,
        }),
      ),
      total,
      page,
      pageSize: ps,
    };
  }

  async detail(userId: number, notificationId: number): Promise<NotificationEntity> {
    const rec = await this.prisma.notificationRecipient.findUnique({
      where: { notificationId_userId: { notificationId, userId } },
      include: { notification: { include: { sender: { select: { name: true } } } } },
    });
    if (!rec) throw new NotFoundException('通知不存在或无权查看');
    return this.mapEntity(
      { ...rec.notification, senderName: rec.notification.sender?.name },
      { isRead: rec.isRead, readAt: rec.readAt?.toISOString() ?? null },
    );
  }

  async markRead(userId: number, notificationId: number) {
    const rec = await this.prisma.notificationRecipient.findUnique({
      where: { notificationId_userId: { notificationId, userId } },
    });
    if (!rec) throw new NotFoundException('通知不存在或无权查看');
    if (!rec.isRead) {
      await this.prisma.notificationRecipient.update({
        where: { id: rec.id },
        data: { isRead: true, readAt: new Date() },
      });
    }
    return { success: true };
  }

  /** 全部标记已读 */
  async markAllRead(userId: number) {
    const r = await this.prisma.notificationRecipient.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { success: true, updated: r.count };
  }

  async unreadTotal(userId: number): Promise<number> {
    return this.prisma.notificationRecipient.count({
      where: { userId, isRead: false },
    });
  }

  // ===== 供 AI 报告模块调用：按报告下发通知 =====
  async sendReportNotification(opts: {
    senderId: number | null;
    userId: number;
    reportId: number;
    title: string;
    content: string;
    periodLabel: string;
  }): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: {
          title: opts.title,
          content: opts.content,
          type: NotifyType.REPORT,
          level: NotifyLevel.NORMAL,
          senderId: opts.senderId,
          scope: NotifyScope.USER,
          orgIds: '[]',
          userIds: JSON.stringify([opts.userId]),
          refId: opts.reportId,
          recipients: {
            create: [{ userId: opts.userId }],
          },
        },
      });
    } catch (e: any) {
      this.logger.warn(`报告通知下发失败(userId=${opts.userId}): ${e.message}`);
    }
  }

  private mapEntity(
    n: any,
    extra?: {
      isRead?: boolean;
      readAt?: string | null;
      recipientCount?: number;
      readCount?: number;
      senderName?: string;
    },
  ): NotificationEntity {
    return {
      id: n.id,
      title: n.title,
      content: n.content,
      type: n.type as NotifyType,
      level: n.level as NotifyLevel,
      senderId: n.senderId,
      senderName: n.senderName ?? extra?.senderName,
      scope: n.scope as NotifyScope,
      refId: n.refId,
      groupId: n.groupId,
      createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : String(n.createdAt),
      isRead: extra?.isRead,
      readAt: extra?.readAt ?? null,
      recipientCount: extra?.recipientCount,
      readCount: extra?.readCount,
    };
  }
}
