import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatisticsService } from './statistics.service';

describe('StatisticsService.getLearningTrend', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('按日统计为空时回退旧学习记录，并补齐连续日期', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 15, 12, 0, 0));

    const prisma = {
      learningDailyStat: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      learningRecord: {
        findMany: vi.fn().mockResolvedValue([
          { duration: 120, updatedAt: new Date(2026, 7, 14, 9, 0, 0) },
        ]),
      },
    };
    const service = new StatisticsService(prisma as any);

    const result = await service.getLearningTrend(undefined, 3);

    expect(result).toEqual([
      { date: '2026-08-13', duration: 0 },
      { date: '2026-08-14', duration: 120 },
      { date: '2026-08-15', duration: 0 },
    ]);
  });

  it('存在按日统计时不重复叠加旧学习记录', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 15, 12, 0, 0));

    const prisma = {
      learningDailyStat: {
        findMany: vi.fn().mockResolvedValue([
          { duration: 60, day: new Date(2026, 7, 15, 0, 0, 0) },
        ]),
      },
      learningRecord: {
        findMany: vi.fn(),
      },
    };
    const service = new StatisticsService(prisma as any);

    const result = await service.getLearningTrend(2, 1);

    expect(result).toEqual([{ date: '2026-08-15', duration: 60 }]);
    expect(prisma.learningRecord.findMany).not.toHaveBeenCalled();
  });
});
