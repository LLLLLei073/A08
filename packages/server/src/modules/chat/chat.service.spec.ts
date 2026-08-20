import { GroupRole, MessageType, Role } from '@ai-party-school/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatService } from './chat.service';

function createService(message: any, groupRole = GroupRole.MEMBER) {
  const prisma = {
    chatMessage: {
      findUnique: vi.fn().mockResolvedValue(message),
      findMany: vi.fn().mockResolvedValue(message ? [message] : []),
      findFirst: vi.fn().mockResolvedValue(message ? { id: message.id } : null),
      update: vi.fn().mockResolvedValue({ ...message, recalled: true }),
    },
    chatMember: {
      findUnique: vi.fn().mockResolvedValue({
        id: 9,
        groupId: message?.groupId ?? 1,
        userId: 1,
        groupRole,
        lastReadMessageId: 0,
        clearedMessageId: 0,
        group: { id: message?.groupId ?? 1, type: 'CUSTOM' },
      }),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  return { prisma, service: new ChatService(prisma as any) };
}

describe('ChatService 消息撤回', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('两分钟内允许发送者撤回', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T04:00:00.000Z'));
    const message = {
      id: 12,
      groupId: 3,
      senderId: 1,
      recalled: false,
      createdAt: new Date('2026-08-15T03:58:01.000Z'),
    };
    const { prisma, service } = createService(message);

    await expect(service.recallMessage({ id: 1, role: Role.MEMBER, orgId: 1 }, 12)).resolves.toEqual({ success: true });
    expect(prisma.chatMessage.update).toHaveBeenCalledWith({ where: { id: 12 }, data: { recalled: true } });
  });

  it('超过两分钟时管理员也不能撤回', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T04:00:00.000Z'));
    const message = {
      id: 13,
      groupId: 3,
      senderId: 2,
      recalled: false,
      createdAt: new Date('2026-08-15T03:57:59.000Z'),
    };
    const { prisma, service } = createService(message, GroupRole.OWNER);

    await expect(service.recallMessage({ id: 1, role: Role.ADMIN, orgId: 1 }, 13))
      .rejects.toThrow('超过 2 分钟的消息不能撤回');
    expect(prisma.chatMessage.update).not.toHaveBeenCalled();
  });

  it('已撤回消息不能重复撤回', async () => {
    const message = {
      id: 14,
      groupId: 3,
      senderId: 1,
      recalled: true,
      createdAt: new Date(),
    };
    const { prisma, service } = createService(message);

    await expect(service.recallMessage({ id: 1, role: Role.MEMBER, orgId: 1 }, 14))
      .rejects.toThrow('消息已撤回');
    expect(prisma.chatMessage.update).not.toHaveBeenCalled();
  });

  it('消息列表保留发送者并把撤回内容统一为一条提示', async () => {
    const createdAt = new Date('2026-08-15T04:00:00.000Z');
    const message = {
      id: 15,
      groupId: 3,
      senderId: 2,
      sender: { name: '张三', role: Role.MEMBER },
      type: MessageType.TEXT,
      content: '原消息内容',
      extra: null,
      recalled: true,
      createdAt,
    };
    const { service } = createService(message);

    const result = await service.listMessages(1, 3, { limit: 30 });

    expect(result).toEqual([
      expect.objectContaining({
        senderName: '张三',
        content: '已撤回一条消息',
        recalled: true,
      }),
    ]);
  });
});

describe('ChatService 单端清空聊天记录', () => {
  it('只更新当前成员的清空游标，不删除群消息', async () => {
    const message = { id: 42, groupId: 3 };
    const { prisma, service } = createService(message);

    await expect(service.clearHistory(1, 3)).resolves.toEqual({
      success: true,
      clearedMessageId: 42,
    });
    expect(prisma.chatMember.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { clearedMessageId: 42, lastReadMessageId: 42 },
    });
    expect(prisma.chatMessage.update).not.toHaveBeenCalled();
  });

  it('消息查询只返回清空游标之后的消息', async () => {
    const message = {
      id: 43,
      groupId: 3,
      senderId: 2,
      sender: { name: '张三', role: Role.MEMBER },
      type: MessageType.TEXT,
      content: '清空后的新消息',
      extra: null,
      recalled: false,
      createdAt: new Date(),
    };
    const { prisma, service } = createService(message);
    prisma.chatMember.findUnique.mockResolvedValue({
      id: 9,
      groupId: 3,
      userId: 1,
      groupRole: GroupRole.MEMBER,
      lastReadMessageId: 42,
      clearedMessageId: 42,
      group: { id: 3, type: 'CUSTOM' },
    });

    await service.listMessages(1, 3, { limit: 30 });

    expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { groupId: 3, id: { gt: 42 } } }),
    );
  });
});
