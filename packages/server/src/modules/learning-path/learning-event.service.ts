import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { guessProbability, updateBktMastery } from './bkt';

interface QuizEvidencePayload {
  isCorrect: boolean;
  questionType: string;
}

@Injectable()
export class LearningEventService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LearningEventService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.processPending(), 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async processPendingForUser(userId: number, limit = 100) {
    const events = await this.prisma.learningEvent.findMany({
      where: { userId, processedAt: null, retryCount: { lt: 5 } },
      select: { id: true },
      orderBy: { occurredAt: 'asc' },
      take: limit,
    });
    for (const event of events) await this.processEvent(event.id);
    return events.length;
  }

  async processPending(limit = 100) {
    if (this.running) return 0;
    this.running = true;
    try {
      const events = await this.prisma.learningEvent.findMany({
        where: { processedAt: null, retryCount: { lt: 5 } },
        select: { id: true },
        orderBy: { occurredAt: 'asc' },
        take: limit,
      });
      for (const event of events) await this.processEvent(event.id);
      return events.length;
    } finally {
      this.running = false;
    }
  }

  async processEvent(eventId: number) {
    try {
      await this.prisma.$transaction(async (tx) => {
        const event = await tx.learningEvent.findUnique({ where: { id: eventId } });
        if (!event || event.processedAt) return;
        if (event.eventType !== 'QUIZ_ANSWER' || event.subjectType !== 'QUESTION') {
          await tx.learningEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } });
          return;
        }
        const payload = this.parsePayload(event.payload);
        const bindings = await tx.questionKnowledge.findMany({
          where: { questionId: event.subjectId },
          include: { node: true },
        });
        for (const binding of bindings) {
          const current = await tx.userKnowledgeState.findUnique({
            where: { userId_nodeId: { userId: event.userId, nodeId: binding.nodeId } },
          });
          const prior = current?.mastery ?? binding.node.pInit;
          const fullUpdate = updateBktMastery({
            prior,
            correct: payload.isCorrect,
            pLearn: binding.node.pLearn,
            pSlip: binding.node.pSlip,
            pGuess: guessProbability(payload.questionType),
          });
          const mastery = Math.min(1, Math.max(0, prior + (fullUpdate - prior) * binding.weight));
          await tx.userKnowledgeState.upsert({
            where: { userId_nodeId: { userId: event.userId, nodeId: binding.nodeId } },
            create: {
              userId: event.userId,
              nodeId: binding.nodeId,
              mastery,
              attempts: 1,
              correctCount: payload.isCorrect ? 1 : 0,
              lastEvidenceAt: event.occurredAt,
              algorithmVersion: 'bkt-v1',
            },
            update: {
              mastery,
              attempts: { increment: 1 },
              correctCount: payload.isCorrect ? { increment: 1 } : undefined,
              lastEvidenceAt: event.occurredAt,
              algorithmVersion: 'bkt-v1',
            },
          });
        }
        await tx.learningEvent.update({
          where: { id: event.id },
          data: { processedAt: new Date(), processingError: null },
        });
      });
      return true;
    } catch (error: any) {
      const message = String(error?.message ?? error).slice(0, 2000);
      await this.prisma.learningEvent.updateMany({
        where: { id: eventId, processedAt: null },
        data: { retryCount: { increment: 1 }, processingError: message },
      }).catch(() => undefined);
      this.logger.warn(`学习事件 ${eventId} 处理失败: ${message}`);
      return false;
    }
  }

  private parsePayload(raw: string): QuizEvidencePayload {
    const payload = JSON.parse(raw) as Partial<QuizEvidencePayload>;
    if (typeof payload.isCorrect !== 'boolean' || typeof payload.questionType !== 'string') {
      throw new Error('答题证据格式不合法');
    }
    return payload as QuizEvidencePayload;
  }
}
