import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePaperDto, GenerateAdaptivePaperDto, PaperEntity, Role } from '@ai-party-school/shared';
import { selectAdaptiveQuestions } from './adaptive-paper';

@Injectable()
export class PaperService {
  constructor(private readonly prisma: PrismaService) {}

  private map(p: any): PaperEntity {
    return {
      id: p.id,
      title: p.title,
      totalScore: p.totalScore,
      passScore: p.passScore,
      duration: p.duration ?? 0,
      questions: (p.questions ?? []).map((pq: any) => ({
        questionId: pq.questionId,
        score: pq.score,
        question: pq.question
          ? {
              id: pq.question.id,
              type: pq.question.type,
              stem: pq.question.stem,
              options: JSON.parse(pq.question.options || '[]'),
              answer: pq.question.answer,
              analysis: pq.question.analysis,
              category: pq.question.category,
            }
          : undefined,
      })),
    };
  }

  async findAll(params: { page?: number; pageSize?: number; keyword?: string }) {
    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 20, 100);
    const where: any = {};
    if (params.keyword) where.title = { contains: params.keyword };
    const [list, total] = await Promise.all([
      this.prisma.paper.findMany({
        where,
        include: { questions: { include: { question: true } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: 'desc' },
      }),
      this.prisma.paper.count({ where }),
    ]);
    return { list: list.map(this.map), total, page, pageSize };
  }

  async findOne(id: number) {
    const p = await this.prisma.paper.findUnique({
      where: { id },
      include: { questions: { include: { question: true }, orderBy: { sort: 'asc' } } },
    });
    if (!p) throw new NotFoundException('试卷不存在');
    return this.map(p);
  }

  async generateAdaptive(dto: GenerateAdaptivePaperDto, actor: { role: Role; orgId: number }) {
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('目标党员不存在');
    if (actor.role === Role.SECRETARY && user.orgId !== actor.orgId) {
      throw new ForbiddenException('只能为本支部党员生成试卷');
    }
    const [states, bindings, recentRecords] = await Promise.all([
      this.prisma.userKnowledgeState.findMany({ where: { userId: dto.userId } }),
      this.prisma.questionKnowledge.findMany({ where: { node: { active: true } }, include: { node: true, question: true } }),
      this.prisma.quizRecord.findMany({
        where: { userId: dto.userId, submitTime: { gte: new Date(Date.now() - 30 * 86_400_000) } },
        include: { quiz: { include: { paper: { include: { questions: true } } } } },
      }),
    ]);
    const stateMap = new Map(states.map((state) => [state.nodeId, state.mastery]));
    const recentIds = new Set(recentRecords.flatMap((record) => record.quiz.paper.questions.map((item) => item.questionId)));
    const candidates = bindings.map((binding) => ({
      questionId: binding.questionId,
      nodeId: binding.nodeId,
      mastery: stateMap.get(binding.nodeId) ?? binding.node.pInit,
      difficulty: binding.difficulty,
      type: binding.question.type,
      recentlyUsed: recentIds.has(binding.questionId),
    }));
    const selected = selectAdaptiveQuestions(candidates, dto.questionCount);
    if (selected.length < dto.questionCount) {
      throw new BadRequestException(`题库覆盖不足：需要${dto.questionCount}题，当前仅有${selected.length}道已审核知识点试题`);
    }
    const baseScore = Math.floor(100 / selected.length);
    const questions = selected.map((candidate, index) => ({
      questionId: candidate.questionId,
      score: index === selected.length - 1 ? 100 - baseScore * (selected.length - 1) : baseScore,
    }));
    const paper = await this.create({
      title: dto.title || `[自适应] ${user.name}薄弱知识诊断卷`,
      passScore: dto.passScore ?? 60,
      duration: dto.duration ?? Math.max(10, selected.length * 2),
      questions,
    });
    return {
      paper,
      strategy: 'weakness-60% + difficulty-30% + novelty-10%',
      coverage: new Set(selected.map((item) => item.nodeId)).size,
      targetUserId: dto.userId,
    };
  }

  async create(dto: CreatePaperDto) {
    const totalScore = dto.questions.reduce((s, q) => s + q.score, 0);
    if (dto.passScore < 0) throw new BadRequestException('及格分不能为负');
    if (dto.passScore > totalScore) throw new BadRequestException('及格分不能大于总分');
    const questionIds = dto.questions.map((q) => q.questionId);
    if (questionIds.length > 0) {
      const count = await this.prisma.question.count({ where: { id: { in: questionIds } } });
      if (count !== questionIds.length) throw new BadRequestException('部分题目不存在');
    }
    const p = await this.prisma.paper.create({
      data: {
        title: dto.title,
        totalScore,
        passScore: dto.passScore,
        duration: dto.duration ?? 0,
        questions: {
          create: dto.questions.map((q, idx) => ({
            questionId: q.questionId,
            score: q.score,
            sort: idx,
          })),
        },
      },
      include: { questions: { include: { question: true } } },
    });
    return this.map(p);
  }

  async update(id: number, dto: Partial<CreatePaperDto>) {
    const existing = await this.prisma.paper.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('试卷不存在');

    // 计算更新后的有效总分与及格分
    let totalScore = existing.totalScore;
    if (dto.questions) {
      totalScore = dto.questions.reduce((s, q) => s + q.score, 0);
    }
    const passScore = dto.passScore !== undefined ? dto.passScore : existing.passScore;

    if (passScore < 0) throw new BadRequestException('及格分不能为负');
    if (passScore > totalScore) throw new BadRequestException('及格分不能大于总分');

    if (dto.questions) {
      const questionIds = dto.questions.map((q) => q.questionId);
      if (questionIds.length > 0) {
        const count = await this.prisma.question.count({ where: { id: { in: questionIds } } });
        if (count !== questionIds.length) throw new BadRequestException('部分题目不存在');
      }
    }

    const data: any = {};
    if (dto.title) data.title = dto.title;
    if (dto.passScore !== undefined) data.passScore = dto.passScore;
    if (dto.duration !== undefined) data.duration = dto.duration;
    if (dto.questions) {
      data.totalScore = totalScore;
      data.questions = {
        deleteMany: {},
        create: dto.questions.map((q, idx) => ({
          questionId: q.questionId,
          score: q.score,
          sort: idx,
        })),
      };
    }
    const p = await this.prisma.paper.update({
      where: { id },
      data,
      include: { questions: { include: { question: true }, orderBy: { sort: 'asc' } } },
    });
    return this.map(p);
  }

  async remove(id: number) {
    const quizCount = await this.prisma.quiz.count({ where: { paperId: id } });
    if (quizCount > 0) throw new BadRequestException('试卷已被测验引用，无法删除');
    await this.prisma.paper.delete({ where: { id } });
    return { success: true };
  }
}
