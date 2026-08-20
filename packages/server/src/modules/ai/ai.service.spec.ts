import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiService, redactSensitiveText } from './ai.service';
import { QType, Role } from '@ai-party-school/shared';
import { ForbiddenException } from '@nestjs/common';

// ---- 构造 mock 依赖 ----
function makePrismaMock() {
  return {
    user: { findUnique: vi.fn().mockResolvedValue({ id: 1, name: '党员1' }) },
    learningRecord: { findMany: vi.fn().mockResolvedValue([]) },
    wrongQuestion: { findMany: vi.fn().mockResolvedValue([]) },
    quizRecord: {
      findMany: vi.fn().mockResolvedValue([
        {
          userId: 1,
          quizId: 10,
          answers: JSON.stringify({
            // questionId=1 答对（SINGLE，正确答案 A）
            1: 'A',
            // questionId=2 答错（SINGLE，正确答案 A，用户选 B）
            2: 'B',
          }),
          score: 20, // 低于 0.6 * totalScore(100) => 进入低分分支
          quiz: {
            paper: {
              totalScore: 100,
              questions: [
                {
                  questionId: 1,
                  question: { id: 1, type: QType.SINGLE, answer: 'A', category: '党章' },
                },
                {
                  questionId: 2,
                  question: { id: 2, type: QType.SINGLE, answer: 'A', category: '时政' },
                },
              ],
            },
          },
        },
      ]),
    },
    content: {
      findMany: vi.fn().mockResolvedValue([
        { id: 100, title: '时政学习', category: '时政', tags: [], type: 'ARTICLE' },
      ]),
    },
    aiReport: { findUnique: vi.fn() },
  };
}

function makeRedisMock() {
  return {
    get: vi.fn().mockResolvedValue(null), // 缓存未命中
    set: vi.fn().mockResolvedValue('OK'),
  };
}

function makeStatsMock() {
  return { getOverview: vi.fn(), getOrgStats: vi.fn(), getStatsByOrg: vi.fn() };
}

describe('AiService.recommend - lowScoreCategories 判定', () => {
  let service: AiService;
  let deepseek: { chat: ReturnType<typeof vi.fn>; chatWithTools: ReturnType<typeof vi.fn> };
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    prisma = makePrismaMock();
    deepseek = {
      chat: vi.fn().mockResolvedValue(
        JSON.stringify({
          recommendations: [{ contentId: 100, title: '时政学习', category: '时政', reason: '薄弱补强' }],
        }),
      ),
      chatWithTools: vi.fn(),
    };
    service = new AiService(deepseek as any, prisma as any, makeRedisMock() as any, makeStatsMock() as any, { sendReportNotification: vi.fn() } as any);
  });

  it('答错的题目分类进入 lowScoreCategories，答对的不进入', async () => {
    await service.recommend(1);

    // deepseek.chat 的第一个参数是 messages 数组，取 user 消息内容
    const prompt = (deepseek.chat.mock.calls[0][0] as any[])[0].content as string;

    // 解析出 prompt 中的 lowScoreCategories JSON 片段
    const match = prompt.match(/测验低分涉及分类：(\[.*?\])/);
    expect(match).not.toBeNull();
    const lowScore = JSON.parse(match![1]);

    // 修复后：只含 "时政"（答错），不含 "党章"（答对）
    expect(lowScore).toEqual([{ name: '时政', count: 1 }]);
    expect(lowScore.some((c: any) => c.name === '党章')).toBe(false);
  });

  it('多选题按字母排序判等（顺序无关）', async () => {
    // 重置：questionId=2 为 MULTIPLE，正确 ABCD，用户答 BCAD（乱序但全集）=> 算对
    (prisma.quizRecord.findMany as any).mockResolvedValue([
      {
        userId: 1,
        quizId: 10,
        answers: JSON.stringify({ 1: 'A', 2: 'BCAD' }),
        score: 20,
        quiz: {
          paper: {
            totalScore: 100,
            questions: [
              { questionId: 1, question: { id: 1, type: QType.SINGLE, answer: 'A', category: '党章' } },
              { questionId: 2, question: { id: 2, type: QType.MULTIPLE, answer: 'ABCD', category: '理论' } },
            ],
          },
        },
      },
    ]);

    await service.recommend(1);
    const prompt = (deepseek.chat.mock.calls[0][0] as any[])[0].content as string;
    const match = prompt.match(/测验低分涉及分类：(\[.*?\])/);
    const lowScore = JSON.parse(match![1]);

    // 两题均答对 => lowScoreCategories 为空
    expect(lowScore).toEqual([]);
  });

  it('AI 限流时返回本地推荐并写入缓存', async () => {
    deepseek.chat.mockRejectedValueOnce(Object.assign(new Error('rate limit'), { status: 429 }));
    const redis = makeRedisMock();
    service = new AiService(
      deepseek as any,
      prisma as any,
      redis as any,
      makeStatsMock() as any,
      { sendReportNotification: vi.fn() } as any,
    );

    const result = await service.recommend(1);

    expect(result).toEqual([
      {
        contentId: 100,
        title: '时政学习',
        category: '时政',
        reason: '针对时政薄弱项，建议重点学习',
      },
    ]);
    expect(redis.set).toHaveBeenCalledWith('rec:1', result, 3600);
  });

  it('支部书记不能读取其他支部的 AI 报告', async () => {
    prisma.aiReport.findUnique.mockResolvedValue({
      id: 8,
      userId: 2,
      score: 80,
      user: { id: 2, name: '其他支部党员', orgId: 99, org: { id: 99, name: '其他支部' } },
    } as any);
    await expect(service.getReportDetail(8, {
      id: 1,
      role: Role.SECRETARY,
      orgId: 2,
    })).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('AI输入脱敏', () => {
  it('移除手机号、身份证号和邮箱', () => {
    const redacted = redactSensitiveText('党员13800138000，证件110101199001011234，邮箱test@example.com');
    expect(redacted).not.toContain('13800138000');
    expect(redacted).not.toContain('110101199001011234');
    expect(redacted).not.toContain('test@example.com');
  });
});
