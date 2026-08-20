import { describe, expect, it, vi } from 'vitest';
import { LearningEventService } from './learning-event.service';

describe('LearningEventService 幂等处理', () => {
  it('已处理事件不会再次更新掌握度', async () => {
    const tx = {
      learningEvent: { findUnique: vi.fn().mockResolvedValue({ id: 1, processedAt: new Date() }), update: vi.fn() },
      userKnowledgeState: { upsert: vi.fn() },
    };
    const prisma = { $transaction: vi.fn((fn: any) => fn(tx)), learningEvent: { updateMany: vi.fn() } };
    const service = new LearningEventService(prisma as any);
    expect(await service.processEvent(1)).toBe(true);
    expect(tx.userKnowledgeState.upsert).not.toHaveBeenCalled();
  });

  it('答题证据在同一事务内更新状态并标记完成', async () => {
    const tx = {
      learningEvent: {
        findUnique: vi.fn().mockResolvedValue({ id: 1, userId: 2, subjectId: 3, eventType: 'QUIZ_ANSWER', subjectType: 'QUESTION', payload: '{"isCorrect":true,"questionType":"SINGLE"}', occurredAt: new Date(), processedAt: null }),
        update: vi.fn(),
      },
      questionKnowledge: { findMany: vi.fn().mockResolvedValue([{ nodeId: 4, weight: 1, node: { pInit: .2, pLearn: .15, pSlip: .1 } }]) },
      userKnowledgeState: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
    };
    const prisma = { $transaction: vi.fn((fn: any) => fn(tx)), learningEvent: { updateMany: vi.fn() } };
    const service = new LearningEventService(prisma as any);
    expect(await service.processEvent(1)).toBe(true);
    expect(tx.userKnowledgeState.upsert).toHaveBeenCalledOnce();
    expect(tx.learningEvent.update).toHaveBeenCalledOnce();
  });
});
