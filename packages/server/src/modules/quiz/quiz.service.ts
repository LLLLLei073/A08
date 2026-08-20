import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateQuizDto, SubmitQuizDto, QType, Role } from '@ai-party-school/shared';
import { LearningEventService } from '../learning-path/learning-event.service';

export interface QuizActor {
  id: number;
  role: Role;
  orgId: number;
}

@Injectable()
export class QuizService {
  private readonly logger = new Logger(QuizService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly learningEvents?: LearningEventService,
  ) {}

  /**
   * 查询测验列表
   * - ADMIN：可查全部，按传入 orgId 过滤
   * - SECRETARY：强制按本人 orgId 过滤
   */
  async findAll(
    params: { page?: number; pageSize?: number; orgId?: number; type?: string },
    actor?: QuizActor,
  ) {
    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 20, 100);
    const where: any = {};
    if (actor && actor.role === Role.SECRETARY) {
      where.orgId = actor.orgId;
    } else if (params.orgId) {
      where.orgId = params.orgId;
    }
    if (params.type) where.type = params.type;
    const [list, total] = await Promise.all([
      this.prisma.quiz.findMany({
        where,
        include: { paper: true, org: true },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: 'desc' },
      }),
      this.prisma.quiz.count({ where }),
    ]);
    return {
      list: list.map((q) => ({
        ...q,
        participantUserIds: parseIds((q as any).participantUserIds),
      })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * 我的测验：按参与者筛选
   * - participantUserIds 为空数组 → 支部全部成员可见
   * - 否则只对包含在列表中的用户可见
   */
  async findMyQuizzes(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');
    const quizzes = await this.prisma.quiz.findMany({
      where: { orgId: user.orgId },
      include: {
        paper: { include: { questions: { include: { question: true } } } },
        records: { where: { userId } },
      },
      orderBy: { id: 'desc' },
    });

    const visible = quizzes.filter((q) => {
      const ids = parseIds((q as any).participantUserIds);
      return ids.length === 0 || ids.includes(userId);
    });

    return visible.map((q) => {
      const now = new Date();
      let status: 'not_started' | 'in_progress' | 'ended';
      if (now < q.startTime) status = 'not_started';
      else if (now > q.endTime) status = 'ended';
      else status = 'in_progress';
      const record = q.records[0];
      if (
        record &&
        !record.submitTime &&
        now > this.attemptDeadline(q.endTime, record.startTime, q.duration)
      ) {
        status = 'ended';
      }
      return {
        id: q.id,
        title: q.paper.title,
        type: q.type,
        startTime: q.startTime,
        endTime: q.endTime,
        duration: q.duration,
        totalScore: q.paper.totalScore,
        passScore: q.paper.passScore,
        questionCount: q.paper.questions.length,
        status,
        started: Boolean(record),
        submitted: Boolean(record?.submitTime),
        score: record?.score ?? null,
        passed: record?.passed ?? null,
      };
    });
  }

  async findOne(id: number) {
    const q = await this.prisma.quiz.findUnique({
      where: { id },
      include: {
        paper: { include: { questions: { include: { question: true }, orderBy: { sort: 'asc' } } } },
        org: true,
      },
    });
    if (!q) throw new NotFoundException('测验不存在');
    return { ...q, participantUserIds: parseIds((q as any).participantUserIds) };
  }

  /**
   * 创建测验
   * - ADMIN：可指定任意 orgId
   * - SECRETARY：orgId 强制为本人支部
   */
  /**
   * 依据试卷做题时长与测验类型计算测验时长
   * - 练习测验(PRACTICE)：试卷时长 × 2
   * - 正式考试(EXAM)：试卷时长不变
   * 时长由后端统一从试卷派生，前端不可自定义。
   */
  private async resolveDuration(paperId: number, type: string): Promise<number> {
    const paper = await this.prisma.paper.findUnique({ where: { id: paperId } });
    if (!paper) throw new NotFoundException('试卷不存在');
    const base = (paper as any).duration ?? 0;
    return type === 'PRACTICE' ? base * 2 : base;
  }

  async create(dto: CreateQuizDto, actor?: QuizActor) {
    if (new Date(dto.startTime) >= new Date(dto.endTime)) {
      throw new BadRequestException('开始时间必须早于结束时间');
    }
    let orgId = dto.orgId;
    if (actor && actor.role === Role.SECRETARY) {
      orgId = actor.orgId;
    }
    const duration = await this.resolveDuration(dto.paperId, dto.type);
    return this.prisma.quiz.create({
      data: {
        paperId: dto.paperId,
        orgId,
        type: dto.type as any,
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        duration,
        participantUserIds: JSON.stringify(dto.participantUserIds ?? []),
      },
    });
  }

  async update(id: number, dto: Partial<CreateQuizDto>, actor?: QuizActor) {
    const existing = await this.prisma.quiz.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('测验不存在');
    if (actor && actor.role === Role.SECRETARY && existing.orgId !== actor.orgId) {
      throw new ForbiddenException('无权修改其他支部的测验');
    }

    const data: any = {};
    if (dto.paperId) data.paperId = dto.paperId;
    // SECRETARY 不允许改 orgId
    if (dto.orgId && actor?.role === Role.ADMIN) data.orgId = dto.orgId;
    if (dto.type) data.type = dto.type as any;
    if (dto.startTime) data.startTime = new Date(dto.startTime);
    if (dto.endTime) data.endTime = new Date(dto.endTime);
    if (dto.participantUserIds !== undefined) {
      data.participantUserIds = JSON.stringify(dto.participantUserIds);
    }
    // 时长始终由试卷时长与类型派生，忽略前端传入的 duration
    const effPaperId = dto.paperId ?? existing.paperId;
    const effType = (dto.type ?? existing.type) as string;
    data.duration = await this.resolveDuration(effPaperId, effType);
    return this.prisma.quiz.update({ where: { id }, data });
  }

  async remove(id: number, actor?: QuizActor) {
    const existing = await this.prisma.quiz.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('测验不存在');
    if (actor && actor.role === Role.SECRETARY && existing.orgId !== actor.orgId) {
      throw new ForbiddenException('无权删除其他支部的测验');
    }
    await this.prisma.quiz.delete({ where: { id } });
    return { success: true };
  }

  async start(userId: number, quizId: number) {
    const quiz = await this.findOne(quizId);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');
    if (quiz.orgId !== user.orgId) throw new BadRequestException('您不在此测验的目标支部');

    // 参与者校验
    const ids = parseIds((quiz as any).participantUserIds);
    if (ids.length > 0 && !ids.includes(userId)) {
      throw new BadRequestException('您不在此测验的参与名单中');
    }

    const now = new Date();
    if (now < quiz.startTime) throw new BadRequestException('测验未开始');
    if (now > quiz.endTime) throw new BadRequestException('测验已结束');
    if (quiz.duration <= 0) throw new BadRequestException('该测验未设置有效时长，请联系管理员');

    let attempt = await this.prisma.quizRecord.findUnique({
      where: { userId_quizId: { userId, quizId } },
    });
    if (attempt?.submitTime) throw new BadRequestException('您已提交过本次测验');
    if (!attempt) {
      try {
        attempt = await this.prisma.quizRecord.create({
          data: { userId, quizId, answers: '{}' },
        });
      } catch (e: any) {
        if (e.code !== 'P2002') throw e;
        attempt = await this.prisma.quizRecord.findUnique({
          where: { userId_quizId: { userId, quizId } },
        });
        if (!attempt || attempt.submitTime) {
          throw new BadRequestException('您已提交过本次测验');
        }
      }
    }

    const deadline = this.attemptDeadline(quiz.endTime, attempt.startTime, quiz.duration);
    const remainingSeconds = Math.max(0, Math.floor((deadline.getTime() - now.getTime()) / 1000));
    if (remainingSeconds <= 0) throw new BadRequestException('本次答题时间已结束');

    // 不暴露答案
    const questions = quiz.paper.questions.map((pq) => ({
      questionId: pq.questionId,
      score: pq.score,
      type: pq.question.type,
      stem: pq.question.stem,
      options: typeof pq.question.options === 'string' ? JSON.parse(pq.question.options) : pq.question.options,
      category: pq.question.category,
    }));
    return {
      quizId: quiz.id,
      type: quiz.type,
      title: quiz.paper.title,
      duration: quiz.duration,
      startedAt: attempt.startTime,
      remainingSeconds,
      startTime: quiz.startTime,
      endTime: quiz.endTime,
      totalScore: quiz.paper.totalScore,
      passScore: quiz.paper.passScore,
      questions,
    };
  }

  async submit(userId: number, quizId: number, dto: SubmitQuizDto) {
    const quiz = await this.findOne(quizId);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');
    if (quiz.orgId !== user.orgId) throw new BadRequestException('您不在此测验的目标支部');

    const ids = parseIds((quiz as any).participantUserIds);
    if (ids.length > 0 && !ids.includes(userId)) {
      throw new BadRequestException('您不在此测验的参与名单中');
    }

    // 同时校验统一考试窗口和从个人开始时刻计算的答题时限。
    const now = new Date();
    if (now < quiz.startTime) throw new BadRequestException('测验未开始');

    const attempt = await this.prisma.quizRecord.findUnique({
      where: { userId_quizId: { userId, quizId } },
    });
    if (!attempt) throw new BadRequestException('请先开始本次测验');
    if (attempt.submitTime) throw new BadRequestException('您已提交过本次测验');
    const deadline = this.attemptDeadline(quiz.endTime, attempt.startTime, quiz.duration);
    if (now.getTime() > deadline.getTime() + 5_000) {
      throw new BadRequestException('本次答题时间已结束');
    }

    let score = 0;
    const wrongs: number[] = [];
    const answerResults: Array<{ questionId: number; questionType: string; isCorrect: boolean }> = [];
    for (const pq of quiz.paper.questions) {
      const userAns = dto.answers[pq.questionId];
      const correct = pq.question.answer;
      const isCorrect = this.checkAnswer(userAns, correct, pq.question.type as QType);
      answerResults.push({ questionId: pq.questionId, questionType: pq.question.type, isCorrect });
      if (isCorrect) {
        score += pq.score;
      } else {
        wrongs.push(pq.questionId);
      }
    }

    const passed = score >= quiz.paper.passScore;
    let record;
    try {
      record = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.quizRecord.updateMany({
          where: { id: attempt.id, submitTime: null },
          data: {
            answers: JSON.stringify(dto.answers),
            score,
            passed,
            submitTime: now,
          },
        });
        if (claimed.count !== 1) {
          throw new BadRequestException('您已提交过本次测验');
        }

        // 同步错题
        for (const qid of wrongs) {
          await tx.wrongQuestion.upsert({
            where: { userId_questionId: { userId, questionId: qid } },
            create: { userId, questionId: qid, wrongCount: 1 },
            update: { wrongCount: { increment: 1 } },
          });
        }
        for (const evidence of answerResults) {
          await tx.learningEvent.create({
            data: {
              userId,
              orgId: user.orgId,
              eventType: 'QUIZ_ANSWER',
              subjectType: 'QUESTION',
              subjectId: evidence.questionId,
              sourceKey: `quiz:${attempt.id}:question:${evidence.questionId}`,
              payload: JSON.stringify({ isCorrect: evidence.isCorrect, questionType: evidence.questionType }),
              occurredAt: now,
            },
          });
        }
        return tx.quizRecord.findUniqueOrThrow({ where: { id: attempt.id } });
      });
    } catch (e: any) {
      if (e.code === 'P2002') throw new BadRequestException('您已提交过本次测验');
      throw e;
    }

    void this.learningEvents?.processPendingForUser(userId).catch((error) => {
      this.logger.warn(`答题已提交，但知识状态异步更新失败: ${String(error?.message ?? error)}`);
    });

    return {
      recordId: record.id,
      score,
      totalScore: quiz.paper.totalScore,
      passed,
      wrongCount: wrongs.length,
    };
  }

  async getResult(userId: number, quizId: number) {
    const record = await this.prisma.quizRecord.findUnique({
      where: { userId_quizId: { userId, quizId } },
      include: {
        quiz: { include: { paper: { include: { questions: { include: { question: true } } } } } },
      },
    });
    if (!record?.submitTime) throw new NotFoundException('未找到已提交的测验记录');
    const detail = record.quiz.paper.questions.map((pq) => ({
      questionId: pq.questionId,
      stem: pq.question.stem,
      options: typeof pq.question.options === 'string' ? JSON.parse(pq.question.options) : pq.question.options,
      correctAnswer: pq.question.answer,
      userAnswer: (typeof record.answers === 'string' ? JSON.parse(record.answers) : record.answers)?.[pq.questionId] ?? null,
      analysis: pq.question.analysis,
      isCorrect: this.checkAnswer(
        (typeof record.answers === 'string' ? JSON.parse(record.answers) : record.answers)?.[pq.questionId],
        pq.question.answer,
        pq.question.type as QType,
      ),
    }));
    return {
      score: record.score,
      totalScore: record.quiz.paper.totalScore,
      passed: record.passed,
      submittedAt: record.submitTime,
      detail,
    };
  }

  private attemptDeadline(windowEnd: Date, startedAt: Date, durationMinutes: number): Date {
    return new Date(Math.min(
      windowEnd.getTime(),
      startedAt.getTime() + durationMinutes * 60_000,
    ));
  }

  private checkAnswer(userAns: unknown, correct: string, type: QType): boolean {
    if (userAns === undefined || userAns === null) return false;
    if (type === QType.MULTIPLE) {
      if (Array.isArray(userAns)) userAns = (userAns as any[]).join('');
      const ua = String(userAns).split('').sort().join('').toUpperCase();
      const ca = correct.split('').sort().join('').toUpperCase();
      return ua === ca;
    }
    if (type === QType.JUDGE) {
      return String(userAns).toLowerCase() === String(correct).toLowerCase();
    }
    return String(userAns).toUpperCase() === String(correct).toUpperCase();
  }
}

function parseIds(raw: any): number[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
