import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentService } from './content.service';

describe('ContentService 学习时长可信增量', () => {
  beforeEach(() => vi.setSystemTime(new Date('2026-08-13T01:00:00Z')));

  it('首次上报数小时只接受最多 10 秒并写入每日增量', async () => {
    const tx = {
      learningRecord: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn(({ data }) => Promise.resolve({ id: 1, ...data })),
      },
      learningDailyStat: { upsert: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      content: { findUnique: vi.fn().mockResolvedValue({ id: 3, type: 'ARTICLE', body: '一'.repeat(100), duration: null, isPublic: true }) },
      $transaction: vi.fn((callback) => callback(tx)),
    };
    const service = new ContentService(prisma as any);
    const result = await service.recordLearning(1, 3, { duration: 36_000, progress: 100 });
    expect(result.duration).toBe(10);
    expect(result.completed).toBe(false);
    expect(tx.learningDailyStat.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ duration: 10 }),
    }));
  });

  it('后续心跳只累计数据库更新时间之后的秒数', async () => {
    const existing = {
      id: 1,
      duration: 10,
      progress: 50,
      completed: false,
      updatedAt: new Date('2026-08-13T00:59:55Z'),
    };
    const tx = {
      learningRecord: {
        findUnique: vi.fn().mockResolvedValue(existing),
        update: vi.fn(({ data }) => Promise.resolve({ ...existing, ...data })),
      },
      learningDailyStat: { upsert: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      content: { findUnique: vi.fn().mockResolvedValue({ id: 3, type: 'ARTICLE', body: '一'.repeat(100), duration: null, isPublic: true }) },
      $transaction: vi.fn((callback) => callback(tx)),
    };
    const service = new ContentService(prisma as any);
    const result = await service.recordLearning(1, 3, { duration: 999, progress: 100 });
    expect(result.duration).toBe(15);
    expect(tx.learningDailyStat.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: { duration: { increment: 5 } },
    }));
  });
});
