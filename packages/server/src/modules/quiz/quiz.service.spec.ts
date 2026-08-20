import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { QuizService } from './quiz.service';

const baseQuiz = {
  id: 7,
  orgId: 2,
  type: 'EXAM',
  startTime: new Date('2026-08-13T00:00:00Z'),
  endTime: new Date('2026-08-13T02:00:00Z'),
  duration: 30,
  participantUserIds: '[]',
  paper: {
    title: '测试考试',
    totalScore: 100,
    passScore: 60,
    questions: [{
      questionId: 1,
      score: 100,
      question: { type: 'SINGLE', stem: '题目', options: '["A","B"]', category: '分类', answer: 'A' },
    }],
  },
};

describe('QuizService 答题生命周期', () => {
  beforeEach(() => vi.setSystemTime(new Date('2026-08-13T00:10:00Z')));

  it('首次 start 持久化答题记录，返回服务端剩余秒数', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: 1, orgId: 2 }) },
      quizRecord: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 9, startTime: new Date('2026-08-13T00:10:00Z'), submitTime: null }),
      },
    };
    const service = new QuizService(prisma as any);
    vi.spyOn(service, 'findOne').mockResolvedValue(baseQuiz as any);
    const result = await service.start(1, 7);
    expect(prisma.quizRecord.create).toHaveBeenCalledWith({ data: { userId: 1, quizId: 7, answers: '{}' } });
    expect(result.remainingSeconds).toBe(1800);
  });

  it('重复 start 恢复原开始时间，不重置倒计时', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: 1, orgId: 2 }) },
      quizRecord: {
        findUnique: vi.fn().mockResolvedValue({ id: 9, startTime: new Date('2026-08-13T00:00:00Z'), submitTime: null }),
        create: vi.fn(),
      },
    };
    const service = new QuizService(prisma as any);
    vi.spyOn(service, 'findOne').mockResolvedValue(baseQuiz as any);
    const result = await service.start(1, 7);
    expect(prisma.quizRecord.create).not.toHaveBeenCalled();
    expect(result.remainingSeconds).toBe(1200);
  });

  it('个人答题时限结束后拒绝提交', async () => {
    vi.setSystemTime(new Date('2026-08-13T00:40:06Z'));
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: 1, orgId: 2 }) },
      quizRecord: {
        findUnique: vi.fn().mockResolvedValue({ id: 9, startTime: new Date('2026-08-13T00:10:00Z'), submitTime: null }),
      },
      $transaction: vi.fn(),
    };
    const service = new QuizService(prisma as any);
    vi.spyOn(service, 'findOne').mockResolvedValue(baseQuiz as any);
    await expect(service.submit(1, 7, { answers: { 1: 'A' } })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('提交成绩时在同一事务写入唯一答题证据', async () => {
    const tx = {
      quizRecord: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 9 }),
      },
      wrongQuestion: { upsert: vi.fn() },
      learningEvent: { create: vi.fn() },
    };
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: 1, orgId: 2 }) },
      quizRecord: { findUnique: vi.fn().mockResolvedValue({ id: 9, startTime: new Date('2026-08-13T00:00:00Z'), submitTime: null }) },
      $transaction: vi.fn((fn: any) => fn(tx)),
    };
    const eventService = { processPendingForUser: vi.fn().mockResolvedValue(1) };
    const service = new QuizService(prisma as any, eventService as any);
    vi.spyOn(service, 'findOne').mockResolvedValue(baseQuiz as any);
    const result = await service.submit(1, 7, { answers: { 1: 'A' } });
    expect(result.score).toBe(100);
    expect(tx.learningEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ sourceKey: 'quiz:9:question:1', eventType: 'QUIZ_ANSWER' }),
    }));
    expect(eventService.processPendingForUser).toHaveBeenCalledWith(1);
  });
});
