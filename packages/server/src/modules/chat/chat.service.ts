import {
  Injectable,
  Logger,
  OnModuleInit,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  Role,
  GroupType,
  GroupRole,
  MessageType,
  CreateGroupDto,
  UpdateGroupDto,
  SendMessageDto,
  ChatGroupEntity,
  ChatMessageEntity,
  ChatMemberEntity,
} from '@ai-party-school/shared';

/** 操作者上下文 */
export interface ChatActor {
  id: number;
  role: Role;
  orgId: number;
}

/** 管理群固定名称 */
const MANAGE_GROUP_NAME = '党务工作群（书记 · 管理员）';
const MESSAGE_RECALL_WINDOW_MS = 2 * 60 * 1000;
const RECALL_NOTICE = '已撤回一条消息';

@Injectable()
export class ChatService implements OnModuleInit {
  private readonly logger = new Logger(ChatService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // 启动时对齐系统群：补建支部群 / 管理群，并补齐应在群成员。
    // 失败不影响服务启动（如首次启动表尚未创建）。
    try {
      const r = await this.syncSystemGroups();
      this.logger.log(
        `系统群同步完成：群 ${r.groups} 个，新增成员 ${r.joined} 人，移除 ${r.removed} 人`,
      );
    } catch (e: any) {
      this.logger.warn(`系统群同步失败：${e.message}`);
    }
  }

  // ==================== 系统群自动维护 ====================

  /**
   * 同步系统群（幂等，可重复执行）：
   * 1. 每个支部（level>=2 视为支部；没有子节点的组织也按支部处理）一个 ORG 群
   * 2. 全系统一个 MANAGE 群，成员为所有 ADMIN + SECRETARY
   * 3. 成员按当前 orgId / role 补齐与清理
   */
  async syncSystemGroups(): Promise<{ groups: number; joined: number; removed: number }> {
    let joined = 0;
    let removed = 0;

    const orgs = await this.prisma.org.findMany({ select: { id: true, name: true } });
    const users = await this.prisma.user.findMany({ select: { id: true, orgId: true, role: true } });

    // ---- 支部群 ----
    for (const org of orgs) {
      const hasUser = users.some((u) => u.orgId === org.id);
      if (!hasUser) continue; // 无人的组织节点不建群

      let group = await this.prisma.chatGroup.findFirst({
        where: { type: GroupType.ORG, orgId: org.id },
      });
      if (!group) {
        group = await this.prisma.chatGroup.create({
          data: { name: `${org.name} · 支部群`, type: GroupType.ORG, orgId: org.id },
        });
        await this.postSystemMessage(group.id, `「${org.name}」支部群已创建，欢迎各位同志交流学习。`);
      } else if (group.name !== `${org.name} · 支部群`) {
        // 支部改名后同步群名
        await this.prisma.chatGroup.update({
          where: { id: group.id },
          data: { name: `${org.name} · 支部群` },
        });
      }

      const should = users.filter((u) => u.orgId === org.id);
      const res = await this.reconcileMembers(
        group.id,
        should.map((u) => ({ userId: u.id, groupRole: u.role === Role.MEMBER ? GroupRole.MEMBER : GroupRole.ADMIN })),
      );
      joined += res.joined;
      removed += res.removed;
    }

    // ---- 管理群 ----
    const managers = users.filter((u) => u.role === Role.ADMIN || u.role === Role.SECRETARY);
    if (managers.length > 0) {
      let manageGroup = await this.prisma.chatGroup.findFirst({ where: { type: GroupType.MANAGE } });
      if (!manageGroup) {
        manageGroup = await this.prisma.chatGroup.create({
          data: { name: MANAGE_GROUP_NAME, type: GroupType.MANAGE },
        });
        await this.postSystemMessage(manageGroup.id, '党务工作群已创建，用于书记与管理员之间的工作协同。');
      }
      const res = await this.reconcileMembers(
        manageGroup.id,
        managers.map((u) => ({
          userId: u.id,
          groupRole: u.role === Role.ADMIN ? GroupRole.OWNER : GroupRole.MEMBER,
        })),
      );
      joined += res.joined;
      removed += res.removed;
    }

    const groups = await this.prisma.chatGroup.count({
      where: { type: { in: [GroupType.ORG, GroupType.MANAGE] } },
    });
    return { groups, joined, removed };
  }

  /** 让某个群的成员集合与期望集合一致 */
  private async reconcileMembers(
    groupId: number,
    expected: Array<{ userId: number; groupRole: GroupRole }>,
  ): Promise<{ joined: number; removed: number }> {
    const current = await this.prisma.chatMember.findMany({ where: { groupId } });
    const currentIds = new Set(current.map((m) => m.userId));
    const expectedIds = new Set(expected.map((e) => e.userId));

    const toAdd = expected.filter((e) => !currentIds.has(e.userId));
    const toRemove = current.filter((m) => !expectedIds.has(m.userId));

    if (toAdd.length > 0) {
      // 新成员的已读游标直接指向当前最新消息，避免入群即显示大量历史未读
      const last = await this.prisma.chatMessage.findFirst({
        where: { groupId },
        orderBy: { id: 'desc' },
        select: { id: true },
      });
      const cursor = last?.id ?? 0;
      for (const a of toAdd) {
        await this.prisma.chatMember.create({
          data: { groupId, userId: a.userId, groupRole: a.groupRole, lastReadMessageId: cursor },
        });
      }
    }
    if (toRemove.length > 0) {
      await this.prisma.chatMember.deleteMany({
        where: { groupId, userId: { in: toRemove.map((m) => m.userId) } },
      });
    }
    return { joined: toAdd.length, removed: toRemove.length };
  }

  /** 单个用户的系统群归属同步：新建用户、调整支部或角色后调用 */
  async syncUserGroups(userId: number): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { org: true },
      });
      if (!user) return;

      // 1. 支部群
      let orgGroup = await this.prisma.chatGroup.findFirst({
        where: { type: GroupType.ORG, orgId: user.orgId },
      });
      if (!orgGroup) {
        orgGroup = await this.prisma.chatGroup.create({
          data: {
            name: `${user.org?.name ?? '支部'} · 支部群`,
            type: GroupType.ORG,
            orgId: user.orgId,
          },
        });
      }
      // 退出其它支部群
      await this.prisma.chatMember.deleteMany({
        where: { userId, group: { type: GroupType.ORG, orgId: { not: user.orgId } } },
      });
      await this.joinIfAbsent(
        orgGroup.id,
        userId,
        user.role === Role.MEMBER ? GroupRole.MEMBER : GroupRole.ADMIN,
      );

      // 2. 管理群
      const isManager = user.role === Role.ADMIN || user.role === Role.SECRETARY;
      let manageGroup = await this.prisma.chatGroup.findFirst({ where: { type: GroupType.MANAGE } });
      if (isManager) {
        if (!manageGroup) {
          manageGroup = await this.prisma.chatGroup.create({
            data: { name: MANAGE_GROUP_NAME, type: GroupType.MANAGE },
          });
        }
        await this.joinIfAbsent(
          manageGroup.id,
          userId,
          user.role === Role.ADMIN ? GroupRole.OWNER : GroupRole.MEMBER,
        );
      } else if (manageGroup) {
        await this.prisma.chatMember.deleteMany({ where: { groupId: manageGroup.id, userId } });
      }
    } catch (e: any) {
      // 群同步失败不应阻断用户主流程
      this.logger.warn(`用户 ${userId} 群同步失败：${e.message}`);
    }
  }

  /** 新建支部后建群 */
  async ensureOrgGroup(orgId: number): Promise<void> {
    try {
      const org = await this.prisma.org.findUnique({ where: { id: orgId } });
      if (!org) return;
      const exist = await this.prisma.chatGroup.findFirst({
        where: { type: GroupType.ORG, orgId },
      });
      if (exist) {
        if (exist.name !== `${org.name} · 支部群`) {
          await this.prisma.chatGroup.update({
            where: { id: exist.id },
            data: { name: `${org.name} · 支部群` },
          });
        }
        return;
      }
      const group = await this.prisma.chatGroup.create({
        data: { name: `${org.name} · 支部群`, type: GroupType.ORG, orgId },
      });
      await this.postSystemMessage(group.id, `「${org.name}」支部群已创建，欢迎各位同志交流学习。`);
      const members = await this.prisma.user.findMany({ where: { orgId }, select: { id: true, role: true } });
      for (const m of members) {
        await this.joinIfAbsent(group.id, m.id, m.role === Role.MEMBER ? GroupRole.MEMBER : GroupRole.ADMIN);
      }
    } catch (e: any) {
      this.logger.warn(`支部 ${orgId} 建群失败：${e.message}`);
    }
  }

  private async joinIfAbsent(groupId: number, userId: number, groupRole: GroupRole) {
    const exist = await this.prisma.chatMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (exist) {
      if (exist.groupRole !== groupRole) {
        await this.prisma.chatMember.update({ where: { id: exist.id }, data: { groupRole } });
      }
      return;
    }
    const last = await this.prisma.chatMessage.findFirst({
      where: { groupId },
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    await this.prisma.chatMember.create({
      data: { groupId, userId, groupRole, lastReadMessageId: last?.id ?? 0 },
    });
  }

  // ==================== 群列表 / 详情 ====================

  async listMyGroups(userId: number): Promise<ChatGroupEntity[]> {
    const memberships = await this.prisma.chatMember.findMany({
      where: { userId, group: { archived: false } },
      include: { group: true },
    });
    if (memberships.length === 0) return [];

    const groupIds = memberships.map((m) => m.groupId);

    const [counts, lastMsgAgg] = await Promise.all([
      this.prisma.chatMember.groupBy({ by: ['groupId'], where: { groupId: { in: groupIds } }, _count: true }),
      this.prisma.chatMessage.groupBy({ by: ['groupId'], where: { groupId: { in: groupIds } }, _max: { id: true } }),
    ]);
    const countMap = new Map(counts.map((c) => [c.groupId, c._count]));
    const lastIds = lastMsgAgg.map((g) => g._max.id).filter((v): v is number => v != null);
    const lastMsgs = lastIds.length
      ? await this.prisma.chatMessage.findMany({
          where: { id: { in: lastIds } },
          include: { sender: { select: { name: true } } },
        })
      : [];
    const lastMap = new Map(lastMsgs.map((m) => [m.groupId, m]));

    const result: ChatGroupEntity[] = [];
    for (const m of memberships) {
      const unread = await this.prisma.chatMessage.count({
        where: {
          groupId: m.groupId,
          id: { gt: Math.max(m.lastReadMessageId, m.clearedMessageId) },
          senderId: { not: userId },
        },
      });
      const latest = lastMap.get(m.groupId);
      const last = latest && latest.id > m.clearedMessageId ? latest : undefined;
      result.push({
        id: m.group.id,
        name: m.group.name,
        type: m.group.type as GroupType,
        orgId: m.group.orgId,
        ownerId: m.group.ownerId,
        notice: m.group.notice,
        memberCount: countMap.get(m.groupId) ?? 0,
        myRole: m.groupRole as GroupRole,
        muted: m.muted,
        unread,
        lastMessage: last
          ? {
              content: last.recalled ? RECALL_NOTICE : previewOf(last.type as MessageType, last.content),
              senderName: last.sender?.name,
              type: last.type as MessageType,
              createdAt: last.createdAt.toISOString(),
            }
          : null,
        createdAt: m.group.createdAt.toISOString(),
      });
    }

    // 排序：系统群优先，其次按最后消息时间倒序
    const typeWeight = (t: GroupType) => (t === GroupType.MANAGE ? 0 : t === GroupType.ORG ? 1 : 2);
    result.sort((a, b) => {
      const ta = a.lastMessage ? Date.parse(a.lastMessage.createdAt) : 0;
      const tb = b.lastMessage ? Date.parse(b.lastMessage.createdAt) : 0;
      if (b.unread !== a.unread) return b.unread - a.unread;
      if (tb !== ta) return tb - ta;
      return typeWeight(a.type) - typeWeight(b.type);
    });
    return result;
  }

  /** 校验成员身份并返回 membership + group */
  private async requireMembership(userId: number, groupId: number) {
    const membership = await this.prisma.chatMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      include: { group: true },
    });
    if (!membership) throw new ForbiddenException('你不在该群聊中');
    return membership;
  }

  async getGroup(userId: number, groupId: number): Promise<ChatGroupEntity> {
    const m = await this.requireMembership(userId, groupId);
    const memberCount = await this.prisma.chatMember.count({ where: { groupId } });
    const unread = await this.prisma.chatMessage.count({
      where: {
        groupId,
        id: { gt: Math.max(m.lastReadMessageId, m.clearedMessageId) },
        senderId: { not: userId },
      },
    });
    return {
      id: m.group.id,
      name: m.group.name,
      type: m.group.type as GroupType,
      orgId: m.group.orgId,
      ownerId: m.group.ownerId,
      notice: m.group.notice,
      memberCount,
      myRole: m.groupRole as GroupRole,
      muted: m.muted,
      unread,
      lastMessage: null,
      createdAt: m.group.createdAt.toISOString(),
    };
  }

  async listMembers(userId: number, groupId: number): Promise<ChatMemberEntity[]> {
    await this.requireMembership(userId, groupId);
    const members = await this.prisma.chatMember.findMany({
      where: { groupId },
      include: { user: { include: { org: true } } },
      orderBy: [{ groupRole: 'asc' }, { joinedAt: 'asc' }],
    });
    return members.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      role: m.user.role as Role,
      orgName: m.user.org?.name,
      groupRole: m.groupRole as GroupRole,
      joinedAt: m.joinedAt.toISOString(),
    }));
  }

  // ==================== 自建群 ====================

  async createGroup(actor: ChatActor, dto: CreateGroupDto): Promise<ChatGroupEntity> {
    const ids = Array.from(new Set([...(dto.memberIds ?? []), actor.id]));
    if (ids.length < 2) throw new BadRequestException('群聊至少需要 2 名成员');
    if (ids.length > 200) throw new BadRequestException('单个群聊成员不能超过 200 人');

    const users = await this.prisma.user.findMany({ where: { id: { in: ids } } });
    if (users.length !== ids.length) throw new BadRequestException('部分成员不存在');

    // 邀请范围限制：普通党员只能拉本支部的人，书记可拉本支部成员与管理员
    if (actor.role !== Role.ADMIN) {
      const invalid = users.filter(
        (u) => u.id !== actor.id && u.orgId !== actor.orgId && !(actor.role === Role.SECRETARY && u.role === Role.ADMIN),
      );
      if (invalid.length > 0) throw new ForbiddenException('只能邀请本支部成员建群');
    }

    const group = await this.prisma.chatGroup.create({
      data: {
        name: dto.name,
        type: GroupType.CUSTOM,
        ownerId: actor.id,
        notice: dto.notice,
        members: {
          create: users.map((u) => ({
            userId: u.id,
            groupRole: u.id === actor.id ? GroupRole.OWNER : GroupRole.MEMBER,
          })),
        },
      },
    });
    const me = users.find((u) => u.id === actor.id);
    await this.postSystemMessage(group.id, `${me?.name ?? '群主'} 创建了群聊「${dto.name}」`);
    return this.getGroup(actor.id, group.id);
  }

  async updateGroup(actor: ChatActor, groupId: number, dto: UpdateGroupDto) {
    const m = await this.requireMembership(actor.id, groupId);
    this.assertCanManage(actor, m);
    const data: any = {};
    if (dto.name !== undefined) {
      if (m.group.type !== GroupType.CUSTOM) throw new BadRequestException('系统群名称不可修改');
      data.name = dto.name;
    }
    if (dto.notice !== undefined) data.notice = dto.notice;
    const g = await this.prisma.chatGroup.update({ where: { id: groupId }, data });
    if (dto.notice !== undefined && dto.notice) {
      await this.postSystemMessage(groupId, `群公告已更新：${dto.notice}`);
    }
    return { id: g.id, name: g.name, notice: g.notice };
  }

  /** 群管理权限：自建群群主/群管理员；系统群由 ADMIN 或本支部书记管理 */
  private assertCanManage(actor: ChatActor, membership: any) {
    const type = membership.group.type as GroupType;
    if (type === GroupType.CUSTOM) {
      if (membership.groupRole === GroupRole.OWNER || membership.groupRole === GroupRole.ADMIN) return;
      if (actor.role === Role.ADMIN) return;
      throw new ForbiddenException('仅群主可执行此操作');
    }
    if (actor.role === Role.ADMIN) return;
    if (actor.role === Role.SECRETARY && (type === GroupType.MANAGE || membership.group.orgId === actor.orgId)) return;
    throw new ForbiddenException('权限不足');
  }

  async addMembers(actor: ChatActor, groupId: number, userIds: number[]) {
    const m = await this.requireMembership(actor.id, groupId);
    if (m.group.type !== GroupType.CUSTOM) {
      throw new BadRequestException('支部群与管理群成员由系统自动维护，无需手动增减');
    }
    this.assertCanManage(actor, m);
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds } } });
    if (users.length !== userIds.length) throw new BadRequestException('部分成员不存在');
    if (actor.role !== Role.ADMIN) {
      const invalid = users.filter((u) => u.orgId !== actor.orgId && u.role !== Role.ADMIN);
      if (invalid.length > 0) throw new ForbiddenException('只能邀请本支部成员');
    }
    for (const u of users) await this.joinIfAbsent(groupId, u.id, GroupRole.MEMBER);
    await this.postSystemMessage(groupId, `${users.map((u) => u.name).join('、')} 加入了群聊`);
    return { success: true, added: users.length };
  }

  async removeMembers(actor: ChatActor, groupId: number, userIds: number[]) {
    const m = await this.requireMembership(actor.id, groupId);
    if (m.group.type !== GroupType.CUSTOM) {
      throw new BadRequestException('系统群成员由系统自动维护');
    }
    this.assertCanManage(actor, m);
    if (userIds.includes(m.group.ownerId ?? -1)) throw new BadRequestException('不能移除群主');
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { name: true } });
    await this.prisma.chatMember.deleteMany({ where: { groupId, userId: { in: userIds } } });
    await this.postSystemMessage(groupId, `${users.map((u) => u.name).join('、')} 已被移出群聊`);
    return { success: true };
  }

  async leaveGroup(userId: number, groupId: number) {
    const m = await this.requireMembership(userId, groupId);
    if (m.group.type !== GroupType.CUSTOM) throw new BadRequestException('支部群与管理群不可退出');
    if (m.group.ownerId === userId) throw new BadRequestException('群主需先解散群聊或转让群主');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    await this.prisma.chatMember.delete({ where: { id: m.id } });
    await this.postSystemMessage(groupId, `${user?.name ?? '成员'} 退出了群聊`);
    return { success: true };
  }

  async dissolveGroup(actor: ChatActor, groupId: number) {
    const m = await this.requireMembership(actor.id, groupId);
    if (m.group.type !== GroupType.CUSTOM) throw new BadRequestException('系统群不可解散');
    if (m.group.ownerId !== actor.id && actor.role !== Role.ADMIN) {
      throw new ForbiddenException('仅群主可解散群聊');
    }
    await this.prisma.chatGroup.delete({ where: { id: groupId } });
    return { success: true };
  }

  // ==================== 消息 ====================

  /**
   * 拉取消息
   * - after：增量轮询，取 id 大于 after 的最新消息（升序）
   * - before：向上翻历史，取 id 小于 before 的消息（返回时已转为升序）
   */
  async listMessages(
    userId: number,
    groupId: number,
    opts: { before?: number; after?: number; limit?: number },
  ): Promise<ChatMessageEntity[]> {
    const membership = await this.requireMembership(userId, groupId);
    const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
    const clearedMessageId = membership.clearedMessageId;

    let rows;
    if (opts.after && opts.after > 0) {
      rows = await this.prisma.chatMessage.findMany({
        where: { groupId, id: { gt: Math.max(opts.after, clearedMessageId) } },
        include: { sender: { select: { name: true, role: true } } },
        orderBy: { id: 'asc' },
        take: limit,
      });
    } else {
      rows = await this.prisma.chatMessage.findMany({
        where: {
          groupId,
          id: {
            gt: clearedMessageId,
            ...(opts.before ? { lt: opts.before } : {}),
          },
        },
        include: { sender: { select: { name: true, role: true } } },
        orderBy: { id: 'desc' },
        take: limit,
      });
      rows = rows.reverse();
    }
    return rows.map((r) => this.mapMessage(r, userId));
  }

  async sendMessage(userId: number, groupId: number, dto: SendMessageDto): Promise<ChatMessageEntity> {
    const m = await this.requireMembership(userId, groupId);
    if (m.group.archived) throw new BadRequestException('该群聊已归档，无法发言');
    const content = dto.content.trim();
    if (!content) throw new BadRequestException('消息内容不能为空');

    const msg = await this.prisma.chatMessage.create({
      data: {
        groupId,
        senderId: userId,
        type: dto.type ?? MessageType.TEXT,
        content,
      },
      include: { sender: { select: { name: true, role: true } } },
    });
    // 发送者自己的已读游标同步前移
    await this.prisma.chatMember.update({
      where: { id: m.id },
      data: { lastReadMessageId: msg.id },
    });
    return this.mapMessage(msg, userId);
  }

  async recallMessage(actor: ChatActor, messageId: number) {
    const msg = await this.prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('消息不存在');
    if (msg.recalled) throw new BadRequestException('消息已撤回');
    const membership = await this.requireMembership(actor.id, msg.groupId);
    const isSelf = msg.senderId === actor.id;
    const isManager =
      actor.role === Role.ADMIN ||
      membership.groupRole === GroupRole.OWNER ||
      membership.groupRole === GroupRole.ADMIN;
    if (!isSelf && !isManager) throw new ForbiddenException('只能撤回自己发送的消息');
    // 所有撤回操作统一限制为发送后 2 分钟内，管理员也不能绕过时限。
    if (Date.now() - msg.createdAt.getTime() > MESSAGE_RECALL_WINDOW_MS) {
      throw new BadRequestException('超过 2 分钟的消息不能撤回');
    }
    await this.prisma.chatMessage.update({ where: { id: messageId }, data: { recalled: true } });
    return { success: true };
  }

  /**
   * 仅清空当前成员看到的历史记录。群消息本体不会被删除，其他成员不受影响。
   * 以消息 ID 为游标，保证清空后到达的新消息仍会正常显示。
   */
  async clearHistory(userId: number, groupId: number) {
    const membership = await this.requireMembership(userId, groupId);
    const last = await this.prisma.chatMessage.findFirst({
      where: { groupId },
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    const clearedMessageId = Math.max(membership.clearedMessageId, last?.id ?? 0);
    const lastReadMessageId = Math.max(membership.lastReadMessageId, clearedMessageId);
    await this.prisma.chatMember.update({
      where: { id: membership.id },
      data: { clearedMessageId, lastReadMessageId },
    });
    return { success: true, clearedMessageId };
  }

  /** 标记已读；不传 messageId 则标记到该群最新一条 */
  async markRead(userId: number, groupId: number, messageId?: number) {
    const m = await this.requireMembership(userId, groupId);
    let cursor = messageId;
    if (!cursor) {
      const last = await this.prisma.chatMessage.findFirst({
        where: { groupId },
        orderBy: { id: 'desc' },
        select: { id: true },
      });
      cursor = last?.id ?? 0;
    }
    if (cursor > m.lastReadMessageId) {
      await this.prisma.chatMember.update({ where: { id: m.id }, data: { lastReadMessageId: cursor } });
    }
    return { success: true, lastReadMessageId: Math.max(cursor, m.lastReadMessageId) };
  }

  /** 群聊未读总数（用于红点） */
  async unreadTotal(userId: number): Promise<number> {
    const memberships = await this.prisma.chatMember.findMany({
      where: { userId, muted: false, group: { archived: false } },
      select: { groupId: true, lastReadMessageId: true, clearedMessageId: true },
    });
    let total = 0;
    for (const m of memberships) {
      total += await this.prisma.chatMessage.count({
        where: {
          groupId: m.groupId,
          id: { gt: Math.max(m.lastReadMessageId, m.clearedMessageId) },
          senderId: { not: userId },
        },
      });
    }
    return total;
  }

  async toggleMute(userId: number, groupId: number, muted: boolean) {
    const m = await this.requireMembership(userId, groupId);
    await this.prisma.chatMember.update({ where: { id: m.id }, data: { muted } });
    return { success: true, muted };
  }

  // ==================== 供其它模块调用 ====================

  /** 发一条系统消息（无发送人） */
  async postSystemMessage(
    groupId: number,
    content: string,
    type: MessageType = MessageType.SYSTEM,
    extra?: Record<string, unknown>,
  ) {
    return this.prisma.chatMessage.create({
      data: {
        groupId,
        senderId: null,
        type,
        content,
        extra: extra ? JSON.stringify(extra) : null,
      },
    });
  }

  /** 找到支部群 id（不存在则创建） */
  async getOrCreateOrgGroupId(orgId: number): Promise<number | null> {
    let g = await this.prisma.chatGroup.findFirst({ where: { type: GroupType.ORG, orgId } });
    if (!g) {
      await this.ensureOrgGroup(orgId);
      g = await this.prisma.chatGroup.findFirst({ where: { type: GroupType.ORG, orgId } });
    }
    return g?.id ?? null;
  }

  /** 可选择的联系人（建群时使用） */
  async listContacts(actor: ChatActor, keyword?: string) {
    const where: any = { id: { not: actor.id } };
    if (keyword) where.name = { contains: keyword };
    if (actor.role !== Role.ADMIN) {
      where.OR = [{ orgId: actor.orgId }, { role: Role.ADMIN }];
    }
    const users = await this.prisma.user.findMany({
      where,
      include: { org: true },
      take: 300,
      orderBy: { id: 'asc' },
    });
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role as Role,
      orgId: u.orgId,
      orgName: u.org?.name,
    }));
  }

  private mapMessage(r: any, viewerId: number): ChatMessageEntity {
    let extra: Record<string, unknown> | null = null;
    if (r.extra) {
      try {
        extra = JSON.parse(r.extra);
      } catch {
        extra = null;
      }
    }
    return {
      id: r.id,
      groupId: r.groupId,
      senderId: r.senderId,
      senderName: r.sender?.name,
      senderRole: r.sender?.role as Role,
      type: r.type as MessageType,
      content: r.recalled ? RECALL_NOTICE : r.content,
      extra,
      recalled: r.recalled,
      createdAt: r.createdAt.toISOString(),
      mine: r.senderId === viewerId,
    };
  }
}

/** 会话列表里的消息摘要 */
function previewOf(type: MessageType, content: string): string {
  if (type === MessageType.IMAGE) return '[图片]';
  if (type === MessageType.REPORT) return `[AI 报告] ${content}`;
  if (type === MessageType.NOTICE) return `[通知] ${content}`;
  return content.length > 40 ? `${content.slice(0, 40)}…` : content;
}
